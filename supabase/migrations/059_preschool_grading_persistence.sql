-- Gabon Éduc+ Primaire v0.12.0-primary.11
-- Rend les observations de maternelle compatibles avec la persistance
-- relationnelle Supabase, en complément du payload JSON de reprise.

insert into public.subjects(code, name, description) values
  ('MAT-LANG', 'Langage et communication', 'Mobiliser le langage et communiquer'),
  ('MAT-MATH', 'Premiers outils mathématiques', 'Construire les premiers outils pour structurer sa pensée'),
  ('MAT-MONDE', 'Explorer le monde', 'Se repérer, observer et comprendre le monde'),
  ('MAT-MOTR', 'Activités physiques et motricité', 'Agir, s’exprimer et comprendre à travers l’activité physique'),
  ('MAT-ARTS', 'Activités artistiques', 'Agir, s’exprimer et comprendre à travers les activités artistiques'),
  ('MAT-AUTO', 'Vivre ensemble et autonomie', 'Apprendre ensemble, devenir autonome et vivre avec les autres')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

alter table public.assessments
  add column if not exists evaluation_mode text not null default 'numeric';

alter table public.assessment_scores
  add column if not exists mastery_level text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assessments_evaluation_mode_check'
      and conrelid = 'public.assessments'::regclass
  ) then
    alter table public.assessments
      add constraint assessments_evaluation_mode_check
      check (evaluation_mode in ('numeric', 'mastery'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'assessment_scores_mastery_level_check'
      and conrelid = 'public.assessment_scores'::regclass
  ) then
    alter table public.assessment_scores
      add constraint assessment_scores_mastery_level_check
      check (mastery_level is null or mastery_level in (
        'acquired', 'developing', 'not_acquired', 'not_evaluated'
      ));
  end if;
end;
$$;

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
    v_class := null;
    v_grade := null;
    v_subject := null;

    select c.id, c.grade_level_id into v_class, v_grade
    from public.class_groups c where c.id = v_requested_class;

    -- Une opération ancienne peut conserver l'UUID d'une classe recréée.
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
      raise exception 'Matière ou domaine introuvable pour l''évaluation % : %',
        coalesce(v_assessment->>'title', v_assessment_id::text),
        coalesce(v_assessment->>'subject', 'absent');
    end if;

    if v_class <> v_requested_class then
      v_payload := jsonb_set(
        v_payload,
        array['assessments', (v_assessment_index - 1)::text, 'classId'],
        to_jsonb(v_class::text),
        false
      );
    end if;

    insert into public.assessments(
      id, teacher_id, class_group_id, subject_id, grade_level_id, title,
      assessment_type, total_points, opens_at, status,
      grading_period_id, max_score, grading_coefficient, is_included,
      evaluation_mode
    ) values (
      v_assessment_id, v_teacher, v_class, v_subject, v_grade,
      coalesce(nullif(v_assessment->>'title',''), 'Évaluation'),
      case when v_assessment->>'evaluationMode' = 'mastery' then 'Observation' else 'Évaluation' end,
      coalesce((v_assessment->>'maxScore')::numeric, 10),
      case when coalesce(v_assessment->>'date','') = '' then null else ((v_assessment->>'date')::date)::timestamptz end,
      'draft', null, coalesce((v_assessment->>'maxScore')::numeric, 10),
      coalesce((v_assessment->>'coefficient')::numeric, 1),
      coalesce((v_assessment->>'active')::boolean, true),
      case when v_assessment->>'evaluationMode' = 'mastery' then 'mastery' else 'numeric' end
    ) on conflict (id) do update set
      class_group_id = excluded.class_group_id,
      subject_id = excluded.subject_id,
      grade_level_id = excluded.grade_level_id,
      title = excluded.title,
      assessment_type = excluded.assessment_type,
      total_points = excluded.total_points,
      opens_at = excluded.opens_at,
      max_score = excluded.max_score,
      grading_coefficient = excluded.grading_coefficient,
      is_included = excluded.is_included,
      evaluation_mode = excluded.evaluation_mode,
      updated_at = now()
    where assessments.teacher_id = v_teacher;
  end loop;

  for v_score in
    select value from jsonb_array_elements(coalesce(v_payload->'scores', '[]'::jsonb))
  loop
    insert into public.assessment_scores(
      id, assessment_id, class_student_id, score_value, score_status,
      mastery_level, entered_by
    ) values (
      (v_score->>'id')::uuid,
      (v_score->>'assessmentId')::uuid,
      (v_score->>'studentId')::uuid,
      case when v_score->>'value' is null then null else (v_score->>'value')::numeric end,
      coalesce(nullif(v_score->>'status',''), 'not_graded'),
      nullif(v_score->>'mastery', ''),
      v_teacher
    ) on conflict (id) do update set
      score_value = excluded.score_value,
      score_status = excluded.score_status,
      mastery_level = excluded.mastery_level,
      entered_by = excluded.entered_by,
      updated_at = now();
  end loop;

  insert into public.grading_workspaces(teacher_id, payload)
  values (v_teacher, v_payload)
  on conflict (teacher_id) do update
    set payload = excluded.payload, updated_at = now();
end;
$$;

revoke all on function public.save_grading_workspace_relational(jsonb) from public;
grant execute on function public.save_grading_workspace_relational(jsonb) to authenticated;

comment on column public.assessments.evaluation_mode
is 'numeric pour le primaire élémentaire, mastery pour les observations de maternelle.';

comment on column public.assessment_scores.mastery_level
is 'Niveau de maîtrise maternelle : acquired, developing, not_acquired ou not_evaluated.';
