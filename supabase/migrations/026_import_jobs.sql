-- Gabon Éduc+ v0.9.0 — imports contrôlés et rapports de lignes
create table if not exists public.import_jobs(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,import_module text not null,file_name text not null,
  import_status text not null default 'preview' check(import_status in ('preview','validated','processing','completed','failed','cancelled')),
  total_rows integer not null default 0 check(total_rows>=0),valid_rows integer not null default 0 check(valid_rows>=0),invalid_rows integer not null default 0 check(invalid_rows>=0),
  duplicate_rows integer not null default 0 check(duplicate_rows>=0),summary jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.import_job_errors(
  id uuid primary key default gen_random_uuid(),import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  line_number integer not null check(line_number>0),column_name text not null,invalid_value text,problem text not null,expected_correction text not null,created_at timestamptz not null default now()
);
create index if not exists idx_import_jobs_school_status on public.import_jobs(school_id,import_status,created_at desc);
create index if not exists idx_import_errors_job_line on public.import_job_errors(import_job_id,line_number);
alter table public.import_jobs enable row level security;alter table public.import_job_errors enable row level security;
create policy import_jobs_authorized_read on public.import_jobs for select to authenticated using(created_by=auth.uid() or public.has_school_role(school_id,array['school_admin','headmaster','secretary','academic_director']));
create policy import_jobs_authorized_insert on public.import_jobs for insert to authenticated with check(created_by=auth.uid() and public.has_school_role(school_id,array['school_admin','headmaster','secretary','academic_director']));
create policy import_jobs_owner_update on public.import_jobs for update to authenticated using(created_by=auth.uid()) with check(created_by=auth.uid());
create policy import_errors_authorized_read on public.import_job_errors for select to authenticated using(exists(select 1 from public.import_jobs j where j.id=import_job_id and (j.created_by=auth.uid() or public.has_school_role(j.school_id,array['school_admin','headmaster','secretary','academic_director']))));
create policy import_errors_owner_insert on public.import_job_errors for insert to authenticated with check(exists(select 1 from public.import_jobs j where j.id=import_job_id and j.created_by=auth.uid()));
drop trigger if exists trg_import_jobs_updated_at on public.import_jobs;create trigger trg_import_jobs_updated_at before update on public.import_jobs for each row execute function public.set_updated_at();
