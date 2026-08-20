-- Gabon Éduc+ v0.8.0 — validation multi-rôles, verrouillage et audit des bulletins
alter table public.report_cards
  add column if not exists school_id uuid references public.schools(id) on delete cascade,
  add column if not exists completeness_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists validation_log jsonb not null default '[]'::jsonb,
  add column if not exists reopened_by uuid references public.profiles(id) on delete set null,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_reason text;

create table if not exists public.report_card_workflow_events(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  report_card_id uuid not null references public.report_cards(id) on delete cascade,actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null,workflow_action text not null check(workflow_action in ('subject_validated','head_teacher_validated','admin_checked','headmaster_validated','locked','reopened','published')),
  reason text,created_at timestamptz not null default now()
);
create index if not exists idx_report_cards_school_status on public.report_cards(school_id,report_status,updated_at desc);
create index if not exists idx_report_workflow_report on public.report_card_workflow_events(report_card_id,created_at);
alter table public.report_card_workflow_events enable row level security;
create policy report_workflow_member_read on public.report_card_workflow_events for select to authenticated using(public.belongs_to_school(school_id));
create policy report_workflow_authorized_insert on public.report_card_workflow_events for insert to authenticated with check(actor_id=auth.uid() and public.has_school_role(school_id,array['school_admin','headmaster','academic_director','head_teacher','teacher']));

create or replace function public.enforce_report_reopening()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.report_status in ('locked','published') and new.report_status not in ('locked','published') then
    if not public.has_school_role(old.school_id,array['school_admin','headmaster']) then raise exception 'Rôle non autorisé pour la réouverture.'; end if;
    if coalesce(trim(new.reopened_reason),'')='' then raise exception 'Le motif de réouverture est obligatoire.'; end if;
    new.reopened_by:=auth.uid();new.reopened_at:=now();
  end if;
  if new.report_status='locked' and new.snapshot is null then raise exception 'Un snapshot est obligatoire avant verrouillage.'; end if;
  return new;
end;
$$;
drop trigger if exists trg_enforce_report_reopening on public.report_cards;
create trigger trg_enforce_report_reopening before update on public.report_cards for each row execute function public.enforce_report_reopening();
