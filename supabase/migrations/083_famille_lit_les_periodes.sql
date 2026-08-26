-- Gabon Éduc+ — La famille lit le nom des périodes
--
-- Les notes du nouveau modèle sont déjà lisibles par la famille : la politique
-- posée à la migration 081 couvre « is_family_of ». Mais une note est rattachée
-- à une période, et la table des périodes n'était lisible que par les membres
-- de l'établissement — « belongs_to_school ». Un parent n'en est pas membre.
--
-- Sans cette lecture, le relevé afficherait des notes sous un identifiant
-- hexadécimal au lieu de « Palier 3 ». Un parent ne doit jamais lire de suite
-- hexadécimale sur le relevé de son enfant.
--
-- La lecture est limitée aux périodes de l'établissement où l'enfant est
-- inscrit, et ne donne accès qu'au libellé et au découpage — jamais aux
-- verrous ni aux motifs de réouverture, qui regardent l'établissement seul.

drop policy if exists school_periods_family_read on public.school_periods;
create policy school_periods_family_read on public.school_periods
  for select to authenticated
  using (exists(
    select 1 from public.student_records sr
    where sr.school_id = school_periods.school_id
      and public.is_family_of(sr.id)
  ));

notify pgrst, 'reload schema';
