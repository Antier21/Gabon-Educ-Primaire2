-- Gabon Éduc+ — Étape 4
-- Fonction sécurisée appelée ultérieurement par l'atelier de préparation.
create or replace function public.create_lesson_plan_from_labels(
  p_subject_name text,
  p_grade_name text,
  p_title text,
  p_week_number integer,
  p_duration_minutes integer,
  p_prerequisite text,
  p_situation_problem text,
  p_teacher_actions text,
  p_student_actions text,
  p_lesson_summary text,
  p_differentiation text,
  p_homework text,
  p_status public.content_status default 'draft'
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_subject_id uuid;
  v_grade_id uuid;
  v_lesson_id uuid;
begin
  select id into v_teacher_id from profiles where user_id = auth.uid();
  if v_teacher_id is null then raise exception 'Profil enseignant introuvable'; end if;

  select id into v_subject_id from subjects where lower(name)=lower(p_subject_name) limit 1;
  select id into v_grade_id from grade_levels where lower(name)=lower(p_grade_name) limit 1;
  if v_subject_id is null or v_grade_id is null then raise exception 'Matière ou niveau introuvable'; end if;

  insert into lesson_plans(teacher_id,subject_id,grade_level_id,title,week_number,duration_minutes,prerequisite,situation_problem,teacher_actions,student_actions,lesson_summary,differentiation,homework,status)
  values(v_teacher_id,v_subject_id,v_grade_id,p_title,p_week_number,p_duration_minutes,p_prerequisite,p_situation_problem,p_teacher_actions,p_student_actions,p_lesson_summary,p_differentiation,p_homework,p_status)
  returning id into v_lesson_id;
  return v_lesson_id;
end;
$$;

grant execute on function public.create_lesson_plan_from_labels(text,text,text,integer,integer,text,text,text,text,text,text,text,public.content_status) to authenticated;
