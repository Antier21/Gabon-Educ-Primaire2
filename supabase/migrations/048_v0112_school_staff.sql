-- Gabon Éduc+ v0.11.2 — registre RH du personnel
create table if not exists public.school_staff(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  employee_number text not null,
  first_name text not null,
  last_name text not null,
  gender text,
  date_of_birth date,
  place_of_birth text,
  nationality text,
  marital_status text,
  phone text,
  email text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  national_id_number text,
  cnss_number text,
  staff_category text not null default 'other',
  job_title text not null,
  department text,
  employment_status text not null default 'active',
  hire_date date not null,
  contract_type text not null,
  contract_start date,
  contract_end date,
  work_schedule text,
  highest_diploma text,
  specialty text,
  years_experience integer not null default 0 check(years_experience >= 0),
  previous_employer text,
  administrative_notes text,
  pedagogical_user_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, employee_number)
);
create index if not exists idx_school_staff_school_status on public.school_staff(school_id,employment_status);
create index if not exists idx_school_staff_school_category on public.school_staff(school_id,staff_category);
alter table public.school_staff enable row level security;
drop policy if exists school_staff_member_read on public.school_staff;
create policy school_staff_member_read on public.school_staff for select to authenticated
using(public.belongs_to_school(school_id));
drop policy if exists school_staff_admin_write on public.school_staff;
create policy school_staff_admin_write on public.school_staff for all to authenticated
using(public.has_school_role(school_id,array['school_admin','headmaster','secretary']))
with check(public.has_school_role(school_id,array['school_admin','headmaster','secretary']));
drop trigger if exists trg_school_staff_updated_at on public.school_staff;
create trigger trg_school_staff_updated_at before update on public.school_staff
for each row execute function public.set_updated_at();
