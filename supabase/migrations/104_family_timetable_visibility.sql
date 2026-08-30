-- Gabon Éduc+ Primaire — EDT visible dans les espaces Parent et Élève
--
-- Les créneaux sont bien synchronisés dans timetable_slots. Cependant les
-- anciennes politiques familiales n'ont pas toujours été appliquées en
-- production, et la relation school_subjects reste réservée aux membres de
-- l'établissement. Le résultat côté famille est alors un emploi du temps vide.
--
-- Ces deux fonctions SECURITY DEFINER évitent toute récursion RLS : elles ne
-- donnent accès qu'à la classe de l'élève connecté ou à celle d'un enfant
-- réellement rattaché au responsable connecté.

create or replace function public.family_can_read_timetable_class(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists(
      select 1
      from public.student_records sr
      where sr.class_group_id = target_class
        and coalesce(sr.status, 'active') <> 'archived'
        and (
          sr.profile_id = auth.uid()
          or exists(
            select 1
            from public.guardian_student_links gsl
            join public.guardians g on g.id = gsl.guardian_id
            where gsl.student_id = sr.id
              and g.profile_id = auth.uid()
              and coalesce(g.status, 'active') = 'active'
          )
        )
    );
$$;

revoke all on function public.family_can_read_timetable_class(uuid) from public;
grant execute on function public.family_can_read_timetable_class(uuid) to authenticated;

-- PostgREST doit aussi pouvoir résoudre school_subjects(label) dans la requête
-- de l'espace famille. On n'ouvre pas tout le catalogue : uniquement les
-- matières qui apparaissent dans l'EDT d'une classe autorisée pour ce compte.
create or replace function public.family_can_read_timetable_subject(
  target_subject uuid,
  target_school uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists(
      select 1
      from public.timetable_slots ts
      join public.student_records sr on sr.class_group_id = ts.class_group_id
      where ts.school_subject_id = target_subject
        and ts.school_id = target_school
        and coalesce(sr.status, 'active') <> 'archived'
        and (
          sr.profile_id = auth.uid()
          or exists(
            select 1
            from public.guardian_student_links gsl
            join public.guardians g on g.id = gsl.guardian_id
            where gsl.student_id = sr.id
              and g.profile_id = auth.uid()
              and coalesce(g.status, 'active') = 'active'
          )
        )
    );
$$;

revoke all on function public.family_can_read_timetable_subject(uuid, uuid) from public;
grant execute on function public.family_can_read_timetable_subject(uuid, uuid) to authenticated;

-- Répare explicitement la lecture des créneaux, même si la migration familiale
-- historique n'a jamais été inscrite/appliquée sur la base distante.
drop policy if exists timetable_family_read on public.timetable_slots;
create policy timetable_family_read on public.timetable_slots
  for select to authenticated
  using (public.family_can_read_timetable_class(class_group_id));

-- Autorise la relation school_subjects(label) sans donner à une famille accès
-- aux matières d'un autre établissement ou d'une autre classe.
drop policy if exists school_subjects_family_timetable_read on public.school_subjects;
create policy school_subjects_family_timetable_read on public.school_subjects
  for select to authenticated
  using (public.family_can_read_timetable_subject(id, school_id));

grant select on public.timetable_slots to authenticated;
grant select on public.school_subjects to authenticated;

notify pgrst, 'reload schema';
