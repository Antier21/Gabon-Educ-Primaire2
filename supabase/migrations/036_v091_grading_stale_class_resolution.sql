-- Gabon Éduc+ v0.9.1 — réparation des références de classe périmées du registre

create or replace function public.save_grading_workspace_relational(p_payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_payload jsonb := p_payload;
  v_assessment jsonb;
  v_assessment_index bigint;
  v_score jsonb;
  v_subject uuid;
  v_grade uuid;
  v_class uuid;
  v_requested_class uuid;
  v_assessment_id uuid;
begin
  if v_teacher is null then raise exception 'Session utilisateur absente'; end if;

  for v_assessment, v_assessment_index in
    select value, ordinality
    from jsonb_array_elements(coalesce(v_payload->'assessments', '[]'::jsonb)) with ordinality
  loop
    v_assessment_id := (v_assessment->>'id')::uuid;
    v_requested_class := (v_assessment->>'classId')::uuid;
    v_class := null; v_grade := null; v_subject := null;

    select c.id, c.grade_level_id into v_class, v_grade
    from public.class_groups c where c.id = v_requested_class;

    -- Une opération ancienne peut conserver l'UUID d'une classe recréée.
    -- L'élève noté possède encore l'identifiant cloud permettant de la retrouver.
    if v_grade is null then
      select cs.class_group_id, c.grade_level_id into v_class, v_grade
      from jsonb_array_elements(coalesce(v_payload->'scores', '[]'::jsonb)) score(value)
      join public.class_students cs on cs.id = (score.value->>'studentId')::uuid
      join public.class_groups c on c.id = cs.class_group_id
      where score.value->>'assessmentId' = v_assessment_id::text
      limit 1;
    end if;

    select s.id into v_subject from public.subjects s
    where s.is_active and (
      lower(s.name) = lower(v_assessment->>'subject')
      or lower(s.code) = lower(v_assessment->>'subject')
    ) limit 1;

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

    if v_class <> v_requested_class then
      v_payload := jsonb_set(v_payload,
        array['assessments', (v_assessment_index - 1)::text, 'classId'],
        to_jsonb(v_class::text), false);
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
    ) on conflict (id) do update set
      class_group_id = excluded.class_group_id, subject_id = excluded.subject_id,
      grade_level_id = excluded.grade_level_id, title = excluded.title,
      total_points = excluded.total_points, opens_at = excluded.opens_at,
      max_score = excluded.max_score, grading_coefficient = excluded.grading_coefficient,
      is_included = excluded.is_included, updated_at = now()
    where assessments.teacher_id = v_teacher;
  end loop;

  for v_score in select value from jsonb_array_elements(coalesce(v_payload->'scores', '[]'::jsonb))
  loop
    insert into public.assessment_scores(
      id, assessment_id, class_student_id, score_value, score_status, entered_by
    ) values (
      (v_score->>'id')::uuid, (v_score->>'assessmentId')::uuid,
      (v_score->>'studentId')::uuid,
      case when v_score->>'value' is null then null else (v_score->>'value')::numeric end,
      coalesce(nullif(v_score->>'status',''), 'not_graded'), v_teacher
    ) on conflict (id) do update set
      score_value = excluded.score_value, score_status = excluded.score_status,
      entered_by = excluded.entered_by, updated_at = now();
  end loop;

  insert into public.grading_workspaces(teacher_id, payload)
  values (v_teacher, v_payload)
  on conflict (teacher_id) do update set payload = excluded.payload, updated_at = now();
end;
$$;

revoke all on function public.save_grading_workspace_relational(jsonb) from public;
grant execute on function public.save_grading_workspace_relational(jsonb) to authenticated;
