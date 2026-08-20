-- Gabon Éduc+ v0.9.1 — compatibilité entre la file métier et le schéma installé
-- Les colonnes historiques de la table créée en 010 ne correspondent pas au
-- registre établissement ajouté en 019/029. Elles restent disponibles pour
-- les bulletins historiques, mais ne doivent plus bloquer les nouvelles saisies.
alter table public.attendance_records
  alter column class_student_id drop not null,
  alter column grading_period_id drop not null;

-- Les profils utilisent directement l'identifiant auth.users comme clé primaire.
-- La migration 004 cherchait une colonne profiles.user_id qui n'existe pas.
create or replace function public.save_lesson_plan_payload(p_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_subject_id uuid;
  v_grade_id uuid;
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if not exists(select 1 from public.profiles where id = v_profile_id) then
    raise exception 'Profil utilisateur introuvable';
  end if;

  select id into v_subject_id from public.subjects
  where lower(name) = lower(coalesce(p_payload->>'subject','Français')) limit 1;
  select id into v_grade_id from public.grade_levels
  where lower(name) = lower(coalesce(p_payload->>'grade','5e'))
     or lower(code) = lower(coalesce(p_payload->>'grade','5e')) limit 1;
  if v_subject_id is null or v_grade_id is null then
    raise exception 'Matière ou niveau introuvable';
  end if;

  insert into public.lesson_plans(
    id, teacher_id, subject_id, grade_level_id, title, week_number,
    duration_minutes, prerequisite, situation_problem, lesson_summary,
    differentiation, homework, status, payload
  ) values (
    v_id, v_profile_id, v_subject_id, v_grade_id,
    coalesce(nullif(p_payload->>'title',''),'Fiche sans titre'),
    coalesce((p_payload->>'week')::integer,1),
    coalesce((p_payload->>'duration')::integer,55),
    p_payload->>'prerequisite', p_payload->>'situationProblem',
    p_payload->>'summary', p_payload->>'differentiation',
    p_payload->>'homework',
    coalesce((p_payload->>'status')::public.content_status,'draft'), p_payload
  )
  on conflict (id) do update set
    title = excluded.title,
    subject_id = excluded.subject_id,
    grade_level_id = excluded.grade_level_id,
    week_number = excluded.week_number,
    duration_minutes = excluded.duration_minutes,
    prerequisite = excluded.prerequisite,
    situation_problem = excluded.situation_problem,
    lesson_summary = excluded.lesson_summary,
    differentiation = excluded.differentiation,
    homework = excluded.homework,
    status = excluded.status,
    payload = excluded.payload,
    updated_at = now()
  where lesson_plans.teacher_id = v_profile_id;
  return v_id;
end;
$$;

create or replace function public.list_my_lesson_plan_payloads()
returns table(id uuid, payload jsonb, updated_at timestamptz)
language sql
security invoker
set search_path = public
as $$
  select lp.id, lp.payload, lp.updated_at
  from public.lesson_plans lp
  where lp.teacher_id = auth.uid()
  order by lp.updated_at desc;
$$;

create or replace function public.delete_my_lesson_plan(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.lesson_plans
  where id = p_id and teacher_id = auth.uid();
end;
$$;

grant execute on function public.save_lesson_plan_payload(uuid,jsonb) to authenticated;
grant execute on function public.list_my_lesson_plan_payloads() to authenticated;
grant execute on function public.delete_my_lesson_plan(uuid) to authenticated;
