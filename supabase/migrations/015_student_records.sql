-- Gabon Éduc+ v0.8.0 — dossiers élèves et historique de transferts
create table if not exists public.student_records(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,class_student_id uuid references public.class_students(id) on delete set null,
  academic_year_id uuid references public.academic_years(id) on delete set null,class_group_id uuid references public.class_groups(id) on delete set null,
  registration_number text,first_name text not null,last_name text not null,gender text check(gender is null or gender in ('female','male')),
  date_of_birth date,place_of_birth text,nationality text,photo_url text,address text,phone text,email text,previous_school text,
  enrolled_on date,status text not null default 'active' check(status in ('active','transferred','archived')),
  special_needs text,emergency_contact text,administrative_notes text,limited_medical_notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(school_id,registration_number)
);
create table if not exists public.student_transfers(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.student_records(id) on delete cascade,from_class_id uuid references public.class_groups(id) on delete set null,
  to_class_id uuid references public.class_groups(id) on delete set null,academic_year_id uuid references public.academic_years(id) on delete set null,
  reason text,transferred_by uuid not null references public.profiles(id) on delete restrict,transferred_at timestamptz not null default now()
);
create index if not exists idx_student_records_school_class on public.student_records(school_id,class_group_id,status);
create index if not exists idx_student_records_name on public.student_records(school_id,last_name,first_name);
alter table public.student_records enable row level security;alter table public.student_transfers enable row level security;
create policy student_records_staff_read on public.student_records for select to authenticated using(public.belongs_to_school(school_id));
create policy student_records_admin_write on public.student_records for all to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','secretary','academic_director'])) with check(public.has_school_role(school_id,array['school_admin','headmaster','secretary','academic_director']));
create policy student_transfers_staff_read on public.student_transfers for select to authenticated using(public.belongs_to_school(school_id));
create policy student_transfers_admin_write on public.student_transfers for all to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','secretary'])) with check(public.has_school_role(school_id,array['school_admin','headmaster','secretary']));
drop trigger if exists trg_student_records_updated_at on public.student_records;create trigger trg_student_records_updated_at before update on public.student_records for each row execute function public.set_updated_at();
