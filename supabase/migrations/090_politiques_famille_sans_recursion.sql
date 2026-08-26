-- Gabon Éduc+ — Six politiques familiales sorties de la forme qui a déjà cassé
--
-- Le 25 août, l'espace parent s'est vidé d'un coup :
--
--   infinite recursion detected in policy for relation "class_groups" (42P17)
--
-- La cause tenait en trois lignes. Une politique de lecture interrogeait
-- « student_records » depuis une table que « student_records » référence en
-- retour :
--
--   using (exists(select 1 from public.student_records sr
--                 where sr.class_group_id = class_groups.id
--                   and public.is_family_of(sr.id)))
--
-- La sous-requête est elle-même soumise aux politiques de « student_records »,
-- qui renvoient à « class_groups ». PostgreSQL tourne en rond et refuse toute
-- lecture. La migration 085 avait corrigé ce cas précis en déportant la
-- vérification dans une fonction « security definer », dont le corps s'exécute
-- hors politiques : la boucle se ferme.
--
-- Six politiques portaient encore la même forme. Elles n'ont pas cassé — le
-- cycle ne se referme pas sur leurs tables aujourd'hui — mais rien ne garantit
-- qu'une politique posée demain sur « student_records » ne le refermera pas.
-- Une panne de cette famille ne se dégrade pas : elle vide l'espace parent
-- d'un seul coup, pour toutes les familles à la fois.
--
-- Aucune règle ne change ici. « is_family_of_school » et « is_family_of_class »
-- ont exactement le corps des sous-requêtes qu'elles remplacent — mêmes
-- tables, mêmes conditions. Une famille lit ce qu'elle lisait, et rien de plus.
-- Le gain est double : la boucle devient impossible, et la vérification cesse
-- d'être rejouée ligne à ligne — le modèle de bulletin en compte dix-neuf.

-- ---------------------------------------------------------------
-- Migration 079 — le modèle de bulletin, lu par la famille
-- ---------------------------------------------------------------
do $$
declare
  nom text;
begin
  foreach nom in array array[
    'report_model_domains', 'report_model_skills', 'report_model_lines'
  ] loop
    execute format('drop policy if exists %I_family_read on public.%I', nom, nom);
    execute format(
      'create policy %I_family_read on public.%I for select to authenticated '
      'using (public.is_family_of_school(school_id))',
      nom, nom
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------
-- Migration 083 — le nom des périodes
-- Sans lui, le relevé afficherait un identifiant hexadécimal au lieu de
-- « Palier 3 » : un parent ne doit jamais lire cela sur le relevé de son
-- enfant.
-- ---------------------------------------------------------------
drop policy if exists school_periods_family_read on public.school_periods;
create policy school_periods_family_read on public.school_periods
  for select to authenticated
  using (public.is_family_of_school(school_id));

-- ---------------------------------------------------------------
-- Migration 084 — les bulletins publiés
-- Le personnel lit ceux de son établissement ; la famille, ceux de la classe
-- de son enfant. Les deux branches sont conservées telles quelles.
-- ---------------------------------------------------------------
drop policy if exists report_publications_read on public.report_publications;
create policy report_publications_read on public.report_publications
  for select to authenticated
  using (
    public.belongs_to_school(school_id)
    or public.is_family_of_class(class_group_id)
  );

-- ---------------------------------------------------------------
-- Migration 067 — l'emploi du temps de la classe
-- ---------------------------------------------------------------
drop policy if exists timetable_family_read on public.timetable_slots;
create policy timetable_family_read on public.timetable_slots
  for select to authenticated
  using (public.is_family_of_class(class_group_id));

notify pgrst, 'reload schema';
