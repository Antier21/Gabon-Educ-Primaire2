-- Gabon Éduc+ v0.8.0 — documents scolaires et journal de génération
create table if not exists public.school_documents(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  document_kind text not null check(document_kind in ('enrollment_certificate','registration_attestation','student_record','class_list','teacher_list','transcript','report_card','timetable','attendance_sheet','student_card','summons')),
  title text not null,student_id uuid references public.student_records(id) on delete set null,class_group_id uuid references public.class_groups(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,document_status text not null default 'draft' check(document_status in ('draft','generated','archived')),
  storage_path text,created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.document_generation_logs(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  document_id uuid not null references public.school_documents(id) on delete cascade,generated_by uuid not null references public.profiles(id) on delete restrict,
  output_format text not null check(output_format in ('preview','print','pdf')),payload_hash text,generated_at timestamptz not null default now()
);
create index if not exists idx_school_documents_school_kind on public.school_documents(school_id,document_kind,created_at desc);
create index if not exists idx_document_logs_document on public.document_generation_logs(document_id,generated_at desc);
alter table public.school_documents enable row level security;alter table public.document_generation_logs enable row level security;
create policy documents_staff_read on public.school_documents for select to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','secretary','academic_director','supervisor']) or (class_group_id is not null and public.can_access_school_class(school_id,class_group_id)));
create policy documents_self_guardian_read on public.school_documents for select to authenticated using(student_id is not null and exists(select 1 from public.student_records sr where sr.id=student_id and (sr.profile_id=auth.uid() or exists(select 1 from public.guardian_student_links gsl join public.guardians g on g.id=gsl.guardian_id where gsl.student_id=sr.id and g.profile_id=auth.uid()))));
create policy documents_authorized_insert on public.school_documents for insert to authenticated with check(created_by=auth.uid() and public.has_school_role(school_id,array['school_admin','headmaster','secretary','academic_director','head_teacher','teacher','supervisor']));
create policy documents_authorized_update on public.school_documents for update to authenticated using(created_by=auth.uid() or public.has_school_role(school_id,array['school_admin','headmaster','secretary'])) with check(created_by=auth.uid() or public.has_school_role(school_id,array['school_admin','headmaster','secretary']));
create policy documents_admin_delete on public.school_documents for delete to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster']));
create policy document_logs_staff_read on public.document_generation_logs for select to authenticated using(public.belongs_to_school(school_id));
create policy document_logs_self_insert on public.document_generation_logs for insert to authenticated with check(generated_by=auth.uid() and public.belongs_to_school(school_id));
drop trigger if exists trg_school_documents_updated_at on public.school_documents;create trigger trg_school_documents_updated_at before update on public.school_documents for each row execute function public.set_updated_at();
