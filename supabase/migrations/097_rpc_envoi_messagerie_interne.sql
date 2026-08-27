-- Gabon Éduc+ — Création atomique d'une campagne interne
--
-- L'envoi direct depuis le navigateur dépendait à la fois des politiques
-- INSERT et SELECT (à cause de RETURNING). Cette RPC contrôle explicitement
-- l'expéditeur et crée campagne + destinataires dans une seule transaction.

create or replace function public.create_internal_message_campaign(
  p_school_id uuid,
  p_title text,
  p_body text,
  p_audience_kind text,
  p_class_group_id uuid,
  p_level_code text,
  p_priority text,
  p_recipients jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_identifier uuid;
  delivered_time timestamptz := now();
  expected_count integer := coalesce(jsonb_array_length(p_recipients), 0);
  valid_count integer;
begin
  if auth.uid() is null then
    raise exception 'Session expirée. Reconnectez-vous.' using errcode = '42501';
  end if;

  if not public.can_send_school_message(p_school_id) then
    raise exception 'Ce compte n''est pas autorisé à envoyer des messages pour cet établissement.'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null or nullif(btrim(p_body), '') is null then
    raise exception 'Un objet et un message sont nécessaires.' using errcode = '22023';
  end if;

  if p_audience_kind not in ('school', 'class', 'level', 'students') then
    raise exception 'Cible de campagne invalide.' using errcode = '22023';
  end if;

  if p_priority not in ('normal', 'important', 'urgent') then
    raise exception 'Niveau d''importance invalide.' using errcode = '22023';
  end if;

  if expected_count = 0 then
    raise exception 'Aucun parent destinataire.' using errcode = '22023';
  end if;

  select count(*)::integer
  into valid_count
  from jsonb_to_recordset(p_recipients) as recipient(
    guardian_id uuid,
    student_id uuid,
    guardian_name text,
    student_name text,
    class_name text,
    phone text,
    resolved_body text
  )
  where exists (
    select 1
    from public.guardians guardian
    join public.guardian_student_links link
      on link.guardian_id = guardian.id
     and link.student_id = recipient.student_id
     and link.school_id = p_school_id
    join public.student_records student
      on student.id = recipient.student_id
     and student.school_id = p_school_id
     and student.status = 'active'
    where guardian.id = recipient.guardian_id
      and guardian.school_id = p_school_id
      and guardian.status <> 'archived'
  );

  if valid_count <> expected_count then
    raise exception 'La liste des destinataires contient un rattachement invalide.'
      using errcode = '22023';
  end if;

  insert into public.message_campaigns (
    school_id,
    title,
    body,
    channel,
    audience_kind,
    class_group_id,
    level_code,
    status,
    publish_to_parent_space,
    recipient_count,
    sent_count,
    priority,
    created_by
  ) values (
    p_school_id,
    btrim(p_title),
    p_body,
    'internal',
    p_audience_kind,
    case when p_audience_kind = 'class' then p_class_group_id else null end,
    case when p_audience_kind = 'level' then p_level_code else null end,
    'sent',
    true,
    expected_count,
    expected_count,
    p_priority,
    auth.uid()
  )
  returning id into campaign_identifier;

  insert into public.message_recipients (
    campaign_id,
    school_id,
    guardian_id,
    student_id,
    guardian_name,
    student_name,
    class_name,
    phone,
    resolved_body,
    status,
    failure_reason,
    sent_at,
    delivered_at,
    sent_channel
  )
  select
    campaign_identifier,
    p_school_id,
    recipient.guardian_id,
    recipient.student_id,
    recipient.guardian_name,
    recipient.student_name,
    recipient.class_name,
    coalesce(recipient.phone, ''),
    recipient.resolved_body,
    'sent',
    null,
    delivered_time,
    delivered_time,
    'internal'
  from jsonb_to_recordset(p_recipients) as recipient(
    guardian_id uuid,
    student_id uuid,
    guardian_name text,
    student_name text,
    class_name text,
    phone text,
    resolved_body text
  );

  return campaign_identifier;
end;
$$;

revoke all on function public.create_internal_message_campaign(
  uuid, text, text, text, uuid, text, text, jsonb
) from public;
grant execute on function public.create_internal_message_campaign(
  uuid, text, text, text, uuid, text, text, jsonb
) to authenticated;

notify pgrst, 'reload schema';
