-- Gabon Éduc+ v0.11.23 — classes administrées par la direction et listes d'élèves synchronisées

-- Une classe est visible par la direction et par les enseignants qui y sont affectés.
drop policy if exists teacher_classes_read on public.class_groups;
create policy teacher_classes_read on public.class_groups for select to authenticated
  using(
    public.is_super_admin()
    or owner_teacher_id = auth.uid()
    or (school_id is not null and public.can_access_school_class(school_id, id))
  );

-- La création et la structure des classes relèvent exclusivement de l'administration.
drop policy if exists teacher_classes_insert on public.class_groups;
drop policy if exists teacher_classes_update on public.class_groups;
drop policy if exists teacher_classes_delete on public.class_groups;
create policy teacher_classes_insert on public.class_groups for insert to authenticated
  with check(
    public.is_super_admin()
    or public.has_school_role(school_id, array['school_admin','headmaster','academic_director','secretary'])
  );
create policy teacher_classes_update on public.class_groups for update to authenticated
  using(
    public.is_super_admin()
    or public.has_school_role(school_id, array['school_admin','headmaster','academic_director','secretary'])
  )
  with check(
    public.is_super_admin()
    or public.has_school_role(school_id, array['school_admin','headmaster','academic_director','secretary'])
  );
create policy teacher_classes_delete on public.class_groups for delete to authenticated
  using(
    public.is_super_admin()
    or public.has_school_role(school_id, array['school_admin','headmaster','academic_director','secretary'])
  );

-- La liste d'une classe suit les mêmes droits de lecture ; seule l'administration la modifie.
drop policy if exists class_students_read on public.class_students;
drop policy if exists class_students_insert on public.class_students;
drop policy if exists class_students_update on public.class_students;
drop policy if exists class_students_delete on public.class_students;
create policy class_students_read on public.class_students for select to authenticated
  using(exists(
    select 1 from public.class_groups c
    where c.id = class_group_id
      and (public.is_super_admin() or public.can_access_school_class(c.school_id, c.id))
  ));
create policy class_students_insert on public.class_students for insert to authenticated
  with check(exists(
    select 1 from public.class_groups c
    where c.id = class_group_id
      and (public.is_super_admin() or public.has_school_role(c.school_id, array['school_admin','headmaster','academic_director','secretary']))
  ));
create policy class_students_update on public.class_students for update to authenticated
  using(exists(
    select 1 from public.class_groups c
    where c.id = class_group_id
      and (public.is_super_admin() or public.has_school_role(c.school_id, array['school_admin','headmaster','academic_director','secretary']))
  ))
  with check(exists(
    select 1 from public.class_groups c
    where c.id = class_group_id
      and (public.is_super_admin() or public.has_school_role(c.school_id, array['school_admin','headmaster','academic_director','secretary']))
  ));
create policy class_students_delete on public.class_students for delete to authenticated
  using(exists(
    select 1 from public.class_groups c
    where c.id = class_group_id
      and (public.is_super_admin() or public.has_school_role(c.school_id, array['school_admin','headmaster','academic_director','secretary']))
  ));

-- Répare les dossiers déjà inscrits afin qu'ils apparaissent dans la liste de leur classe.
update public.class_students cs
set class_group_id = sr.class_group_id,
    first_name = sr.first_name,
    last_name = sr.last_name,
    email = sr.email,
    registration_number = sr.registration_number,
    date_of_birth = sr.date_of_birth,
    updated_at = now()
from public.student_records sr
where cs.id = sr.id and sr.class_group_id is not null and sr.status = 'active';

insert into public.class_students(
  id, class_group_id, first_name, last_name, email, registration_number, date_of_birth
)
select
  sr.id, sr.class_group_id, sr.first_name, sr.last_name, sr.email,
  sr.registration_number, sr.date_of_birth
from public.student_records sr
where sr.class_group_id is not null
  and sr.status = 'active'
  and not exists(select 1 from public.class_students cs where cs.id = sr.id)
  and not exists(
    select 1 from public.class_students cs
    where cs.class_group_id = sr.class_group_id
      and cs.first_name = sr.first_name
      and cs.last_name = sr.last_name
  );
