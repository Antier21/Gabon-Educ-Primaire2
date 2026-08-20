-- Gabon Éduc+ v0.9.1 — correctif des blocages constatés en recette cloud

-- 1. Rattacher les classes historiques à l'établissement de leur propriétaire.
update public.class_groups c
set school_id = coalesce(
  (select pw.school_id from public.platform_workspaces pw
   where pw.user_id = c.owner_teacher_id and pw.school_id is not null limit 1),
  (select sm.school_id
   from public.school_memberships sm
   where sm.user_id = c.owner_teacher_id and sm.status = 'active'
   order by sm.created_at
   limit 1)
)
where c.school_id is null
  and exists (
    select 1 from public.platform_workspaces pw
    where pw.user_id = c.owner_teacher_id and pw.school_id is not null
    union all
    select 1 from public.school_memberships sm
    where sm.user_id = c.owner_teacher_id and sm.status = 'active'
  );

drop policy if exists academic_years_school_read on public.academic_years;
create policy academic_years_school_read on public.academic_years for select to authenticated
  using(school_id is null or public.belongs_to_school(school_id));

drop policy if exists memberships_school_admin_read on public.school_memberships;
create policy memberships_school_admin_read on public.school_memberships for select to authenticated
  using(
    user_id = auth.uid()
    or public.is_super_admin()
    or public.has_school_role(school_id, array['school_admin','headmaster','academic_director','secretary'])
  );

-- Chaque libellé de classe doit correspondre à une vraie année scolaire UUID.
insert into public.academic_years(
  id, school_id, label, starts_on, ends_on, is_current, is_archived
)
select
  gen_random_uuid(),
  source.school_id,
  source.label,
  make_date(case when source.label ~ '^[0-9]{4}' then substring(source.label from 1 for 4)::integer else extract(year from current_date)::integer end, 9, 1),
  make_date(case when source.label ~ '^[0-9]{4}' then substring(source.label from 1 for 4)::integer + 1 else extract(year from current_date)::integer + 1 end, 7, 31),
  true,
  false
from (
  select distinct school_id, coalesce(nullif(academic_year_label, ''), '2026-2027') as label
  from public.class_groups
  where school_id is not null
) source
where not exists (
  select 1 from public.academic_years ay
  where ay.school_id = source.school_id and ay.label = source.label
);

update public.class_groups c
set academic_year_id = ay.id
from public.academic_years ay
where c.academic_year_id is null
  and ay.school_id = c.school_id
  and ay.label = coalesce(nullif(c.academic_year_label, ''), '2026-2027');

-- 2. Unifier Mes classes et les modules Parents/Assiduité/Documents.
insert into public.student_records(
  id, school_id, class_student_id, academic_year_id, class_group_id,
  registration_number, first_name, last_name, date_of_birth, email,
  enrolled_on, status, administrative_notes, created_by
)
select
  cs.id, c.school_id, cs.id, c.academic_year_id, c.id,
  cs.registration_number, cs.first_name, cs.last_name, cs.date_of_birth, cs.email,
  current_date, 'active', 'Importé automatiquement depuis Mes classes', c.owner_teacher_id
from public.class_students cs
join public.class_groups c on c.id = cs.class_group_id
where c.school_id is not null and c.owner_teacher_id is not null
on conflict (id) do update set
  school_id = excluded.school_id,
  class_student_id = excluded.class_student_id,
  academic_year_id = excluded.academic_year_id,
  class_group_id = excluded.class_group_id,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  updated_at = now();

-- 3. N'exposer aux affectations que des enseignants actifs et acceptés.
create or replace function public.list_school_teachers(p_school_id uuid)
returns table(
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  role text,
  scope_class_ids uuid[],
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.has_school_role(p_school_id, array['school_admin','headmaster','academic_director','secretary'])
     and not public.is_super_admin() then
    raise exception 'Accès refusé aux enseignants de cet établissement';
  end if;
  return query
  select p.id, p.first_name, p.last_name, u.email::text, p.phone,
         sm.role::text, sm.scope_class_ids, sm.created_at, sm.updated_at
  from public.school_memberships sm
  join public.profiles p on p.id = sm.user_id
  left join auth.users u on u.id = p.id
  where sm.school_id = p_school_id
    and sm.status = 'active'
    and sm.invitation_status = 'accepted'
    and sm.role::text in ('teacher','head_teacher')
    and p.is_active
  order by p.last_name, p.first_name;
end;
$$;
revoke all on function public.list_school_teachers(uuid) from public;
grant execute on function public.list_school_teachers(uuid) to authenticated;

-- 4. Donner aux enseignants propriétaires les droits nécessaires sur les évaluations relationnelles.
drop policy if exists assessments_owner_read on public.assessments;
drop policy if exists assessments_owner_write on public.assessments;
create policy assessments_owner_read on public.assessments for select to authenticated
  using(teacher_id = auth.uid() or public.is_super_admin());
create policy assessments_owner_write on public.assessments for all to authenticated
  using(teacher_id = auth.uid() or public.is_super_admin())
  with check(teacher_id = auth.uid() or public.is_super_admin());

-- Sauvegarde atomique : JSON de reprise + tables assessments/assessment_scores.
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

  for v_assessment in select value from jsonb_array_elements(coalesce(p_payload->'assessments', '[]'::jsonb)) loop
    v_assessment_id := (v_assessment->>'id')::uuid;
    v_class := (v_assessment->>'classId')::uuid;
    select c.grade_level_id into v_grade from public.class_groups c where c.id = v_class;
    select s.id into v_subject from public.subjects s
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

  for v_score in select value from jsonb_array_elements(coalesce(p_payload->'scores', '[]'::jsonb)) loop
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

-- 5. Réparer les rattachements des fiches déjà créées quand la classe est identifiable.
update public.lesson_plans lp
set school_id = coalesce(lp.school_id, c.school_id),
    class_group_id = coalesce(lp.class_group_id, c.id)
from public.class_groups c
where c.owner_teacher_id = lp.teacher_id
  and c.name = lp.payload->>'classGroup'
  and (lp.school_id is null or lp.class_group_id is null);
