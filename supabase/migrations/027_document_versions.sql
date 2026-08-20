-- Gabon Éduc+ v0.9.0 — numérotation et versions immuables des documents
alter table public.school_documents
  add column if not exists document_number text,
  add column if not exists issued_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_reason text,
  add column if not exists current_version integer not null default 1 check(current_version>0);
create unique index if not exists school_documents_number_unique on public.school_documents(school_id,document_number) where document_number is not null;
create table if not exists public.school_document_versions(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  document_id uuid not null references public.school_documents(id) on delete cascade,version_number integer not null check(version_number>0),
  snapshot jsonb not null,version_status text not null check(version_status in ('draft','issued','cancelled')),created_by uuid not null references public.profiles(id) on delete restrict,
  reason text,created_at timestamptz not null default now(),unique(document_id,version_number)
);
create index if not exists idx_document_versions_document on public.school_document_versions(document_id,version_number desc);
alter table public.school_document_versions enable row level security;
create policy document_versions_authorized_read on public.school_document_versions for select to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','secretary','academic_director']) or exists(select 1 from public.school_documents d where d.id=document_id and d.created_by=auth.uid()));
create policy document_versions_authorized_insert on public.school_document_versions for insert to authenticated with check(created_by=auth.uid() and public.belongs_to_school(school_id));
-- Les versions émises ne disposent volontairement d'aucune policy UPDATE/DELETE.
