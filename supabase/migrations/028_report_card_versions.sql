-- Gabon Éduc+ v0.9.0 — versions et validations des bulletins
alter table public.report_cards add column if not exists current_version integer not null default 1 check(current_version>0);
create table if not exists public.report_card_versions(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  report_card_id uuid not null references public.report_cards(id) on delete cascade,version_number integer not null check(version_number>0),
  report_status text not null check(report_status in ('draft','calculated','review','validated','locked','published')),
  snapshot jsonb not null,completeness_snapshot jsonb not null default '{}'::jsonb,created_by uuid not null references public.profiles(id) on delete restrict,
  correction_reason text,created_at timestamptz not null default now(),unique(report_card_id,version_number),check(report_status not in ('locked','published') or snapshot<> '{}'::jsonb)
);
create table if not exists public.report_validation_steps(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  report_card_version_id uuid not null references public.report_card_versions(id) on delete cascade,validation_kind text not null check(validation_kind in ('subject','head_teacher','administration','headmaster','publication','reopening')),
  actor_id uuid not null references public.profiles(id) on delete restrict,actor_role text not null,decision text not null check(decision in ('approved','rejected','reopened')),
  reason text,created_at timestamptz not null default now()
);
create index if not exists idx_report_versions_report on public.report_card_versions(report_card_id,version_number desc);
create index if not exists idx_report_validations_version on public.report_validation_steps(report_card_version_id,created_at);
alter table public.report_card_versions enable row level security;alter table public.report_validation_steps enable row level security;
create policy report_versions_scoped_read on public.report_card_versions for select to authenticated using(public.belongs_to_school(school_id));
create policy report_versions_authorized_insert on public.report_card_versions for insert to authenticated with check(created_by=auth.uid() and public.belongs_to_school(school_id));
create policy report_validations_scoped_read on public.report_validation_steps for select to authenticated using(public.belongs_to_school(school_id));
create policy report_validations_authorized_insert on public.report_validation_steps for insert to authenticated with check(actor_id=auth.uid() and public.has_school_role(school_id,array['school_admin','headmaster','academic_director','head_teacher','teacher']));
-- Les versions archivées et étapes de validation sont append-only.
