-- Gabon Éduc+ v0.7.0 — Évaluations, notes, moyennes sources et assiduité
alter table public.assessments
  add column if not exists grading_period_id uuid references public.grading_periods(id) on delete set null,
  add column if not exists max_score numeric(8,2) not null default 20 check(max_score > 0),
  add column if not exists grading_coefficient numeric(8,3) not null default 1 check(grading_coefficient > 0),
  add column if not exists is_included boolean not null default true;

create table if not exists public.assessment_scores(
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  class_student_id uuid not null references public.class_students(id) on delete cascade,
  score_value numeric(8,3),
  score_status text not null default 'not_graded' check(score_status in ('graded','absent','exempt','not_graded')),
  entered_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_id,class_student_id),
  check((score_status='graded' and score_value is null) or score_status<>'graded' or score_value>=0)
);

create table if not exists public.subject_averages(
  id uuid primary key default gen_random_uuid(),
  class_student_id uuid not null references public.class_students(id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  average_value numeric(8,3),
  weighted_value numeric(10,3),
  assessment_count integer not null default 0 check(assessment_count >= 0),
  calculation_sources jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_student_id,class_subject_id)
);

create table if not exists public.attendance_records(
  id uuid primary key default gen_random_uuid(),
  class_student_id uuid not null references public.class_students(id) on delete cascade,
  grading_period_id uuid not null references public.grading_periods(id) on delete cascade,
  absence_count integer not null default 0 check(absence_count >= 0),
  late_count integer not null default 0 check(late_count >= 0),
  details jsonb not null default '[]'::jsonb,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_student_id,grading_period_id)
);

create index if not exists idx_assessments_grading_period on public.assessments(grading_period_id,class_group_id,subject_id);
create index if not exists idx_assessment_scores_assessment on public.assessment_scores(assessment_id);
create index if not exists idx_assessment_scores_student on public.assessment_scores(class_student_id);
create index if not exists idx_subject_averages_subject on public.subject_averages(class_subject_id);
create index if not exists idx_attendance_period on public.attendance_records(grading_period_id,class_student_id);

alter table public.assessment_scores enable row level security;
alter table public.subject_averages enable row level security;
alter table public.attendance_records enable row level security;

create policy assessment_scores_assigned_read on public.assessment_scores for select to authenticated using(exists(
  select 1 from public.assessments a left join public.class_subjects cs on cs.class_group_id=a.class_group_id and cs.grading_period_id=a.grading_period_id
  where a.id=assessment_id and (a.teacher_id=auth.uid() or cs.assigned_teacher_id=auth.uid() or public.is_super_admin())
));
create policy assessment_scores_assigned_write on public.assessment_scores for all to authenticated using(exists(
  select 1 from public.assessments a where a.id=assessment_id and a.teacher_id=auth.uid()
)) with check(entered_by=auth.uid() and exists(select 1 from public.assessments a where a.id=assessment_id and a.teacher_id=auth.uid()));
create policy subject_averages_owner_all on public.subject_averages for all to authenticated using(exists(
  select 1 from public.class_subjects cs where cs.id=class_subject_id and (cs.owner_teacher_id=auth.uid() or cs.assigned_teacher_id=auth.uid() or public.is_super_admin())
)) with check(exists(select 1 from public.class_subjects cs where cs.id=class_subject_id and (cs.owner_teacher_id=auth.uid() or cs.assigned_teacher_id=auth.uid() or public.is_super_admin())));
create policy attendance_owner_all on public.attendance_records for all to authenticated using(recorded_by=auth.uid() or public.is_super_admin()) with check(recorded_by=auth.uid() or public.is_super_admin());

create or replace function public.reject_scores_in_locked_period()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(
    select 1 from public.assessments a
    join public.grading_periods p on p.id=a.grading_period_id
    where a.id=new.assessment_id and p.is_locked
  ) then
    raise exception 'La période est verrouillée : les notes ne peuvent plus être modifiées.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reject_locked_assessment_scores on public.assessment_scores;
create trigger trg_reject_locked_assessment_scores before insert or update on public.assessment_scores for each row execute function public.reject_scores_in_locked_period();

drop trigger if exists trg_assessment_scores_updated_at on public.assessment_scores;
create trigger trg_assessment_scores_updated_at before update on public.assessment_scores for each row execute function public.set_updated_at();
drop trigger if exists trg_subject_averages_updated_at on public.subject_averages;
create trigger trg_subject_averages_updated_at before update on public.subject_averages for each row execute function public.set_updated_at();
drop trigger if exists trg_attendance_records_updated_at on public.attendance_records;
create trigger trg_attendance_records_updated_at before update on public.attendance_records for each row execute function public.set_updated_at();
