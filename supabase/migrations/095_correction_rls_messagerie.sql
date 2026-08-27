-- Gabon Éduc+ — Correction RLS de la messagerie pour le super-administrateur
--
-- has_school_role autorise déjà le super-administrateur à créer un message.
-- La lecture qui accompagne INSERT ... RETURNING était toutefois limitée à
-- belongs_to_school : Supabase refusait alors de retourner la campagne créée.

drop policy if exists message_templates_staff_read on public.message_templates;
create policy message_templates_staff_read on public.message_templates
  for select to authenticated
  using (public.belongs_to_school(school_id) or public.is_super_admin());

drop policy if exists message_campaigns_staff_read on public.message_campaigns;
create policy message_campaigns_staff_read on public.message_campaigns
  for select to authenticated
  using (public.belongs_to_school(school_id) or public.is_super_admin());

drop policy if exists message_recipients_staff_read on public.message_recipients;
create policy message_recipients_staff_read on public.message_recipients
  for select to authenticated
  using (public.belongs_to_school(school_id) or public.is_super_admin());

notify pgrst, 'reload schema';
