-- Gabon Éduc+ — Correction de la suppression manuelle des campagnes
--
-- L'auteur d'une campagne peut toujours la retirer. Les responsables
-- habilités de l'établissement conservent le droit de retirer les autres.

create or replace function public.delete_school_message_campaign(p_campaign_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare target_school uuid;
begin
  delete from public.message_campaigns campaign
  where campaign.id = p_campaign_id
    and (
      campaign.created_by = auth.uid()
      or public.can_send_school_message(campaign.school_id)
    )
  returning campaign.school_id into target_school;

  if found then
    return true;
  end if;

  if not exists (select 1 from public.message_campaigns where id = p_campaign_id) then
    return true;
  end if;

  raise exception 'Suppression non autorisée pour cette campagne.' using errcode = '42501';
end;
$$;

revoke all on function public.delete_school_message_campaign(uuid) from public;
grant execute on function public.delete_school_message_campaign(uuid) to authenticated;

notify pgrst, 'reload schema';
