-- Gabon Éduc+ — Correction de la politique RLS sur class_students pour aligner avec class_groups
-- La politique était trop restrictive et empêchait les enseignants d'accéder aux élèves de leur classe

drop policy if exists class_students_read on public.class_students;

create policy class_students_read on public.class_students for select to authenticated
  using(exists(
    select 1 from public.class_groups c
    where c.id = class_group_id
      and (
        public.is_super_admin()
        or c.owner_teacher_id = auth.uid()
        or public.can_access_school_class(c.school_id, c.id)
      )
  ));
