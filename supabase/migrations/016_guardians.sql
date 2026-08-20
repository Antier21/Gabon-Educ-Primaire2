-- Gabon Éduc+ v0.8.0 — responsables légaux et liens explicites
create table if not exists public.guardians(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,first_name text not null,last_name text not null,
  phone text not null,email text,address text,contact_allowed boolean not null default true,
  status text not null default 'active' check(status in ('active','archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.guardian_student_links(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,student_id uuid not null references public.student_records(id) on delete cascade,
  relationship text not null check(relationship in ('father','mother','guardian','legal_guardian','other')),
  is_primary boolean not null default false,created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),
  unique(guardian_id,student_id)
);
create index if not exists idx_guardians_school_name on public.guardians(school_id,last_name,first_name);
create index if not exists idx_guardian_links_student on public.guardian_student_links(student_id,guardian_id);
alter table public.guardians enable row level security;alter table public.guardian_student_links enable row level security;
create policy guardians_staff_read on public.guardians for select to authenticated using(public.belongs_to_school(school_id) or profile_id=auth.uid());
create policy guardians_admin_write on public.guardians for all to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','secretary'])) with check(public.has_school_role(school_id,array['school_admin','headmaster','secretary']));
create policy guardian_links_staff_read on public.guardian_student_links for select to authenticated using(public.belongs_to_school(school_id) or exists(select 1 from public.guardians g where g.id=guardian_id and g.profile_id=auth.uid()));
create policy guardian_links_admin_write on public.guardian_student_links for all to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','secretary'])) with check(public.has_school_role(school_id,array['school_admin','headmaster','secretary']));
create policy student_records_self_or_guardian_read on public.student_records for select to authenticated using(profile_id=auth.uid() or exists(select 1 from public.guardian_student_links gsl join public.guardians g on g.id=gsl.guardian_id where gsl.student_id=student_records.id and g.profile_id=auth.uid()));
drop trigger if exists trg_guardians_updated_at on public.guardians;create trigger trg_guardians_updated_at before update on public.guardians for each row execute function public.set_updated_at();
