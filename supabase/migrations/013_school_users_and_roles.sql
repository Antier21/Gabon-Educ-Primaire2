-- Gabon Éduc+ v0.8.0 — membres, invitations et périmètres
alter table public.school_memberships
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists scope_class_ids uuid[] not null default '{}',
  add column if not exists invitation_status text not null default 'accepted' check(invitation_status in ('pending','accepted','revoked','expired')),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.school_invitations(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  email text not null,
  role public.user_role not null,
  scope_class_ids uuid[] not null default '{}',
  token_hash text not null unique,
  status text not null default 'pending' check(status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id,email,status)
);
create index if not exists idx_school_memberships_school_status on public.school_memberships(school_id,status);
create index if not exists idx_school_invitations_school_status on public.school_invitations(school_id,status,expires_at);
alter table public.school_invitations enable row level security;
create policy school_invitations_admin_read on public.school_invitations for select to authenticated
  using(public.has_school_role(school_id,array['school_admin','headmaster','secretary']));
create policy school_invitations_admin_insert on public.school_invitations for insert to authenticated
  with check(invited_by=auth.uid() and public.has_school_role(school_id,array['school_admin','headmaster','secretary']));
create policy school_invitations_admin_update on public.school_invitations for update to authenticated
  using(public.has_school_role(school_id,array['school_admin','headmaster']))
  with check(public.has_school_role(school_id,array['school_admin','headmaster']));
create policy school_invitations_admin_delete on public.school_invitations for delete to authenticated
  using(public.has_school_role(school_id,array['school_admin','headmaster']));
drop trigger if exists trg_school_memberships_updated_at on public.school_memberships;
create trigger trg_school_memberships_updated_at before update on public.school_memberships for each row execute function public.set_updated_at();
drop trigger if exists trg_school_invitations_updated_at on public.school_invitations;
create trigger trg_school_invitations_updated_at before update on public.school_invitations for each row execute function public.set_updated_at();
