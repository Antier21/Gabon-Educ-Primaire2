-- Gabon Éduc+ — Autoriser le personnel à envoyer les messages internes
--
-- La page Communication est destinée à la direction, au secrétariat, à la
-- vie scolaire et aux enseignants. La première règle n'acceptait que quatre
-- rôles de direction et refusait donc les autres comptes professionnels.

create or replace function public.can_send_school_message(target_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.school_memberships sm
    where sm.school_id = target_school
      and sm.user_id = auth.uid()
      and sm.status = 'active'
      and sm.role::text in (
        'school_admin',
        'headmaster',
        'academic_director',
        'secretary',
        'supervisor',
        'head_teacher',
        'teacher'
      )
  );
$$;

revoke all on function public.can_send_school_message(uuid) from public;
grant execute on function public.can_send_school_message(uuid) to authenticated;

drop policy if exists message_templates_staff_write on public.message_templates;
create policy message_templates_staff_write on public.message_templates
  for all to authenticated
  using (public.can_send_school_message(school_id))
  with check (public.can_send_school_message(school_id));

drop policy if exists message_campaigns_staff_write on public.message_campaigns;
create policy message_campaigns_staff_write on public.message_campaigns
  for all to authenticated
  using (public.can_send_school_message(school_id))
  with check (public.can_send_school_message(school_id));

drop policy if exists message_recipients_staff_write on public.message_recipients;
create policy message_recipients_staff_write on public.message_recipients
  for all to authenticated
  using (public.can_send_school_message(school_id))
  with check (public.can_send_school_message(school_id));

notify pgrst, 'reload schema';
