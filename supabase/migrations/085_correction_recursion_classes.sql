-- Gabon Éduc+ — Correction : récursion infinie sur « class_groups »
--
-- La migration 084 a ouvert la lecture des classes aux familles ainsi :
--
--   using (exists(select 1 from public.student_records sr
--                 where sr.class_group_id = class_groups.id
--                   and public.is_family_of(sr.id)))
--
-- Cette sous-requête sur « student_records » est elle-même soumise aux
-- politiques de « student_records », qui renvoient à « class_groups ».
-- PostgreSQL tourne en rond et refuse toute lecture :
-- « infinite recursion detected in policy for relation class_groups ».
-- L'espace parent devenait entièrement vide.
--
-- La sortie est celle qu'avait déjà empruntée la migration 068 : déporter la
-- vérification dans une fonction « security definer ». Son corps s'exécute
-- avec les droits du propriétaire, donc hors politiques, et la boucle se
-- ferme. La règle reste identique — une famille lit la classe de son enfant,
-- et rien d'autre.

create or replace function public.is_family_of_class(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.student_records sr
    where sr.class_group_id = target_class
      and public.is_family_of(sr.id)
  );
$$;

revoke all on function public.is_family_of_class(uuid) from public;
grant execute on function public.is_family_of_class(uuid) to authenticated;

drop policy if exists class_groups_family_read on public.class_groups;
create policy class_groups_family_read on public.class_groups
  for select to authenticated
  using (public.is_family_of_class(id));

notify pgrst, 'reload schema';
