-- Gabon Éduc+ v0.8.0 — années, périodes et niveaux par établissement
alter table public.academic_years
  add column if not exists school_id uuid references public.schools(id) on delete cascade,
  add column if not exists is_archived boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
alter table public.academic_years drop constraint if exists academic_years_label_key;
create unique index if not exists academic_years_school_label_unique on public.academic_years(school_id,label) where school_id is not null;
create index if not exists idx_academic_years_school_current on public.academic_years(school_id,is_current,is_archived);

create table if not exists public.school_periods(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  label text not null,
  period_kind text not null check(period_kind in ('trimester','semester')),
  starts_on date,
  ends_on date,
  is_active boolean not null default false,
  is_locked boolean not null default false,
  locked_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  reopened_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id,academic_year_id,label),
  check(starts_on is null or ends_on is null or ends_on>=starts_on)
);
create table if not exists public.school_levels(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  code text not null,label text not null,cycle text not null,is_active boolean not null default true,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,code)
);
create index if not exists idx_school_periods_active on public.school_periods(school_id,academic_year_id,is_active,is_locked);
alter table public.school_periods enable row level security;alter table public.school_levels enable row level security;
create policy school_periods_member_read on public.school_periods for select to authenticated using(public.belongs_to_school(school_id));
create policy school_periods_admin_write on public.school_periods for all to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','academic_director'])) with check(public.has_school_role(school_id,array['school_admin','headmaster','academic_director']));
create policy school_levels_member_read on public.school_levels for select to authenticated using(public.belongs_to_school(school_id));
create policy school_levels_admin_write on public.school_levels for all to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','academic_director'])) with check(public.has_school_role(school_id,array['school_admin','headmaster','academic_director']));
drop trigger if exists trg_academic_years_updated_at on public.academic_years;create trigger trg_academic_years_updated_at before update on public.academic_years for each row execute function public.set_updated_at();
drop trigger if exists trg_school_periods_updated_at on public.school_periods;create trigger trg_school_periods_updated_at before update on public.school_periods for each row execute function public.set_updated_at();
drop trigger if exists trg_school_levels_updated_at on public.school_levels;create trigger trg_school_levels_updated_at before update on public.school_levels for each row execute function public.set_updated_at();
