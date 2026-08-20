-- Gabon Éduc+ v0.9.0 — journal d'audit append-only
create table if not exists public.school_audit_events(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,actor_role text not null,audit_action text not null,module text not null,entity_id text,
  before_data jsonb,after_data jsonb,event_status text not null check(event_status in ('success','error')),message text,
  request_ip inet,user_agent text,created_at timestamptz not null default now(),
  check(not (coalesce(before_data,'{}'::jsonb) ?| array['password','token','secret','authorization','cookie','session'])),
  check(not (coalesce(after_data,'{}'::jsonb) ?| array['password','token','secret','authorization','cookie','session']))
);
create index if not exists idx_audit_events_school_date on public.school_audit_events(school_id,created_at desc);
create index if not exists idx_audit_events_entity on public.school_audit_events(school_id,module,entity_id);
alter table public.school_audit_events enable row level security;
create policy audit_events_authorized_read on public.school_audit_events for select to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','academic_director']));
create policy audit_events_member_insert on public.school_audit_events for insert to authenticated with check(user_id=auth.uid() and public.belongs_to_school(school_id));
-- Aucune policy UPDATE/DELETE : le journal serveur est immuable pour les utilisateurs applicatifs.
