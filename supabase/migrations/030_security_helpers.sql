-- Gabon Éduc+ v0.9.0 — fonctions RLS centralisées
create or replace function public.current_school_ids() returns setof uuid language sql stable security definer set search_path=public as $$
  select sm.school_id from public.school_memberships sm where sm.user_id=auth.uid() and sm.status='active';
$$;
create or replace function public.can_manage_class(target_school uuid,target_class uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or public.has_school_role(target_school,array['school_admin','headmaster','academic_director'])
    or exists(select 1 from public.school_teaching_assignments a where a.school_id=target_school and a.class_group_id=target_class and a.teacher_id=auth.uid() and a.is_active);
$$;
create or replace function public.can_view_student(target_student uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.student_records s where s.id=target_student and (
    s.profile_id=auth.uid() or public.can_manage_class(s.school_id,s.class_group_id)
    or public.has_school_role(s.school_id,array['school_admin','headmaster','secretary','supervisor'])
    or exists(select 1 from public.guardian_student_links l join public.guardians g on g.id=l.guardian_id where l.student_id=s.id and g.profile_id=auth.uid())));
$$;
create or replace function public.can_edit_subject_scores(target_assessment uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.assessments a join public.class_groups c on c.id=a.class_group_id
    left join public.class_subjects cs on cs.class_group_id=a.class_group_id and cs.grading_period_id=a.grading_period_id and cs.subject_id=a.subject_id
    where a.id=target_assessment and not exists(select 1 from public.grading_periods gp where gp.id=a.grading_period_id and gp.is_locked)
      and (a.teacher_id=auth.uid() or cs.assigned_teacher_id=auth.uid() or public.has_school_role(c.school_id,array['school_admin','headmaster','academic_director'])));
$$;
create or replace function public.can_validate_report_card(target_report uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.report_cards r join public.class_groups c on c.id=r.class_group_id where r.id=target_report and public.has_school_role(c.school_id,array['school_admin','headmaster']));
$$;
revoke all on function public.current_school_ids() from public;grant execute on function public.current_school_ids() to authenticated;
revoke all on function public.can_manage_class(uuid,uuid) from public;grant execute on function public.can_manage_class(uuid,uuid) to authenticated;
revoke all on function public.can_view_student(uuid) from public;grant execute on function public.can_view_student(uuid) to authenticated;
revoke all on function public.can_edit_subject_scores(uuid) from public;grant execute on function public.can_edit_subject_scores(uuid) to authenticated;
revoke all on function public.can_validate_report_card(uuid) from public;grant execute on function public.can_validate_report_card(uuid) to authenticated;
