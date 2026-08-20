-- Gabon Éduc+ v0.8.0 — créneaux d'emploi du temps
create table if not exists public.timetable_slots(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,class_group_id uuid not null references public.class_groups(id) on delete cascade,
  school_subject_id uuid not null references public.school_subjects(id) on delete cascade,teacher_id uuid references public.profiles(id) on delete set null,
  room text,weekday smallint not null check(weekday between 1 and 7),starts_at time not null,ends_at time not null,week_label text,
  created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(ends_at>starts_at)
);
create index if not exists idx_timetable_school_day on public.timetable_slots(school_id,academic_year_id,weekday,starts_at);
create index if not exists idx_timetable_teacher_day on public.timetable_slots(teacher_id,weekday,starts_at,ends_at);
create index if not exists idx_timetable_class_day on public.timetable_slots(class_group_id,weekday,starts_at,ends_at);
alter table public.timetable_slots enable row level security;
create policy timetable_member_read on public.timetable_slots for select to authenticated using(public.belongs_to_school(school_id));
create policy timetable_admin_write on public.timetable_slots for all to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','academic_director'])) with check(public.has_school_role(school_id,array['school_admin','headmaster','academic_director']));
drop trigger if exists trg_timetable_slots_updated_at on public.timetable_slots;create trigger trg_timetable_slots_updated_at before update on public.timetable_slots for each row execute function public.set_updated_at();
