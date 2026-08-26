-- Gabon Éduc+ — La direction peut enfin modifier la fiche de son établissement
--
-- Diagnostic. Le logo ajouté depuis l'écran « Établissement » n'arrivait
-- jamais en base, et rien ne le signalait. La table « schools » n'a porté,
-- depuis la migration 002, qu'une seule politique d'écriture :
--
--   create policy "schools_admin_manage" on public.schools for all
--     to authenticated using (public.is_super_admin())
--     with check (public.is_super_admin());
--
-- Un chef d'établissement n'est pas super-administrateur. Son « update » ne
-- voyait donc aucune ligne à modifier.
--
-- Et c'est là que le défaut devient sournois. Une ligne écartée par la clause
-- « using » d'une politique n'est pas un refus : elle est invisible. PostgreSQL
-- ne lève aucune erreur, il met à jour zéro ligne et répond que tout s'est bien
-- passé. L'application affichait « enregistré », la console n'imprimait rien,
-- et la fiche restait figée à sa date de création. Le logo n'était que le
-- symptôme le plus visible : le nom, la province, la ville, l'adresse et le
-- téléphone n'avaient jamais été enregistrés non plus.
--
-- Correction. La fiche appartient à la direction de l'établissement. On lui
-- ouvre la modification — et elle seule : ni le secrétariat, ni les
-- enseignants, ni les familles. Créer ou supprimer un établissement reste au
-- super-administrateur, comme avant.

create policy schools_management_update on public.schools
  for update to authenticated
  using (public.has_school_role(id, array['school_admin', 'headmaster']))
  with check (public.has_school_role(id, array['school_admin', 'headmaster']));

notify pgrst, 'reload schema';
