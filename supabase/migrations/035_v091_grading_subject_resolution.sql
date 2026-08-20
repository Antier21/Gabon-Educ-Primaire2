-- Gabon Éduc+ v0.9.1 — résolution fiable des matières du registre de notes

insert into public.subjects(code, name, description)
values ('HGE', 'Histoire-Géographie', 'Histoire et géographie')
on conflict (code) do update
set name = excluded.name,
    description = coalesce(public.subjects.description, excluded.description),
    is_active = true;

create or replace function public.save_grading_workspace_relational(p_payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_assessment jsonb;
  v_score jsonb;
  v_subject uuid;
  v_grade uuid;
  v_class uuid;
  v_assessment_id uuid;
begin
  if v_teacher is null then raise exception 'Session utilisateur absente'; end if;

  insert into public.grading_workspaces(teacher_id, payload)
  values (v_teacher, p_payload)
  on conflict (teacher_id) do update
    set payload = excluded.payload, updated_at = now();

  for v_assessment in
    select value
    from jsonb_array_elements(coalesce(p_payload->'assessments', '[]'::jsonb))
  loop
    v_assessment_id := (v_assessment->>'id')::uuid;
    v_class := (v_assessment->>'classId')::uuid;
    v_grade := null;
    v_subject := null;

    select c.grade_level_id into v_grade
    from public.class_groups c
    where c.id = v_class;

    select s.id into v_subject
    from public.subjects s
    where s.is_active
      and (
        lower(s.name) = lower(v_assessment->>'subject')
        or lower(s.code) = lower(v_assessment->>'subject')
      )
    limit 1;

    if v_grade is null then
      raise exception 'Classe ou niveau introuvable pour l''évaluation % (classe %)',
        coalesce(v_assessment->>'title', v_assessment_id::text),
        coalesce(v_assessment->>'classId', 'absente');
    end if;
    if v_subject is null then
      raise exception 'Matière introuvable pour l''évaluation % : %',
        coalesce(v_assessment->>'title', v_assessment_id::text),
        coalesce(v_assessment->>'subject', 'absente');
    end if;

    insert into public.assessments(
      id, teacher_id, class_group_id, subject_id, grade_level_id, title,
      assessment_type, total_points, opens_at, status,
      grading_period_id, max_score, grading_coefficient, is_included
    ) values (
      v_assessment_id, v_teacher, v_class, v_subject, v_grade,
      coalesce(nullif(v_assessment->>'title',''), 'Évaluation'),
      'Évaluation', coalesce((v_assessment->>'maxScore')::numeric, 20),
      case when coalesce(v_assessment->>'date','') = '' then null else ((v_assessment->>'date')::date)::timestamptz end,
      'draft', null, coalesce((v_assessment->>'maxScore')::numeric, 20),
      coalesce((v_assessment->>'coefficient')::numeric, 1),
      coalesce((v_assessment->>'active')::boolean, true)
    )
    on conflict (id) do update set
      class_group_id = excluded.class_group_id,
      subject_id = excluded.subject_id,
      grade_level_id = excluded.grade_level_id,
      title = excluded.title,
      total_points = excluded.total_points,
      opens_at = excluded.opens_at,
      max_score = excluded.max_score,
      grading_coefficient = excluded.grading_coefficient,
      is_included = excluded.is_included,
      updated_at = now()
    where assessments.teacher_id = v_teacher;
  end loop;

  for v_score in
    select value
    from jsonb_array_elements(coalesce(p_payload->'scores', '[]'::jsonb))
  loop
    insert into public.assessment_scores(
      id, assessment_id, class_student_id, score_value, score_status, entered_by
    ) values (
      (v_score->>'id')::uuid,
      (v_score->>'assessmentId')::uuid,
      (v_score->>'studentId')::uuid,
      case when v_score->>'value' is null then null else (v_score->>'value')::numeric end,
      coalesce(nullif(v_score->>'status',''), 'not_graded'),
      v_teacher
    )
    on conflict (id) do update set
      score_value = excluded.score_value,
      score_status = excluded.score_status,
      entered_by = excluded.entered_by,
      updated_at = now();
  end loop;
end;
$$;

revoke all on function public.save_grading_workspace_relational(jsonb) from public;
grant execute on function public.save_grading_workspace_relational(jsonb) to authenticated;
