-- Gabon Éduc+ — Liaison fiable entre affectations et cahier de textes
--
-- Le cahier de textes ne doit pas dépendre des politiques de lecture de trois
-- tables imbriquées pour connaître les classes du compte connecté. Cette
-- fonction SECURITY DEFINER exécute la jointure côté serveur et, surtout,
-- impose elle-même teacher_id = auth.uid() : un enseignant ne peut demander
-- ni deviner les affectations d'un collègue.

grant select on table public.school_teaching_assignments to authenticated;
grant select on table public.class_groups to authenticated;
grant select on table public.school_subjects to authenticated;

create or replace function public.get_my_lesson_book_assignments()
returns table(
  class_group_id uuid,
  class_name text,
  school_subject_id uuid,
  subject_label text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    assignment.class_group_id,
    class_group.name as class_name,
    assignment.school_subject_id,
    subject.label as subject_label
  from public.school_teaching_assignments assignment
  join public.class_groups class_group
    on class_group.id = assignment.class_group_id
   and class_group.school_id = assignment.school_id
  join public.school_subjects subject
    on subject.id = assignment.school_subject_id
   and subject.school_id = assignment.school_id
  where assignment.teacher_id = auth.uid()
    and assignment.is_active
    and subject.is_active
    and exists (
      select 1
      from public.school_memberships membership
      where membership.school_id = assignment.school_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
        and membership.invitation_status = 'accepted'
    )
  order by class_group.name, subject.label;
$$;

revoke all on function public.get_my_lesson_book_assignments() from public;
grant execute on function public.get_my_lesson_book_assignments() to authenticated;

notify pgrst, 'reload schema';
