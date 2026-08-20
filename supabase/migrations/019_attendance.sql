-- Gabon Éduc+ v0.8.0 — assiduité et justificatifs
create table if not exists public.attendance_records(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,school_period_id uuid references public.school_periods(id) on delete set null,
  class_group_id uuid references public.class_groups(id) on delete set null,student_id uuid not null references public.student_records(id) on delete cascade,
  timetable_slot_id uuid references public.timetable_slots(id) on delete set null,attendance_kind text not null check(attendance_kind in ('absence','late','early_leave')),
  attendance_date date not null,duration_minutes integer not null default 0 check(duration_minutes>=0),reason text,proof_name text,is_justified boolean not null default false,
  recorded_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
-- La table existe déjà depuis la migration 010 avec le registre de bulletin.
-- Ces ajouts rendent la migration sûre sur une base neuve comme sur une base mise à niveau.
alter table public.attendance_records
  add column if not exists school_id uuid references public.schools(id) on delete cascade,
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null,
  add column if not exists school_period_id uuid references public.school_periods(id) on delete set null,
  add column if not exists class_group_id uuid references public.class_groups(id) on delete set null,
  add column if not exists student_id uuid references public.student_records(id) on delete cascade,
  add column if not exists timetable_slot_id uuid references public.timetable_slots(id) on delete set null,
  add column if not exists attendance_kind text,
  add column if not exists attendance_date date,
  add column if not exists duration_minutes integer not null default 0,
  add column if not exists reason text,
  add column if not exists proof_name text,
  add column if not exists is_justified boolean not null default false;
create index if not exists idx_attendance_student_date on public.attendance_records(student_id,attendance_date desc);
create index if not exists idx_attendance_school_class_date on public.attendance_records(school_id,class_group_id,attendance_date);
alter table public.attendance_records enable row level security;
create policy attendance_staff_read on public.attendance_records for select to authenticated using(public.can_access_school_class(school_id,class_group_id));
create policy attendance_self_guardian_read on public.attendance_records for select to authenticated using(exists(select 1 from public.student_records sr where sr.id=student_id and (sr.profile_id=auth.uid() or exists(select 1 from public.guardian_student_links gsl join public.guardians g on g.id=gsl.guardian_id where gsl.student_id=sr.id and g.profile_id=auth.uid()))));
create policy attendance_authorized_insert on public.attendance_records for insert to authenticated with check(recorded_by=auth.uid() and public.can_access_school_class(school_id,class_group_id));
create policy attendance_authorized_update on public.attendance_records for update to authenticated using((recorded_by=auth.uid() and public.can_access_school_class(school_id,class_group_id)) or public.has_school_role(school_id,array['school_admin','headmaster','supervisor'])) with check((recorded_by=auth.uid() and public.can_access_school_class(school_id,class_group_id)) or public.has_school_role(school_id,array['school_admin','headmaster','supervisor']));
create policy attendance_admin_delete on public.attendance_records for delete to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','supervisor']));
drop trigger if exists trg_attendance_records_updated_at on public.attendance_records;create trigger trg_attendance_records_updated_at before update on public.attendance_records for each row execute function public.set_updated_at();
