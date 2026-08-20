-- Gabon Éduc+ v0.8.0 — établissement, préférences et stockage hybride
alter type public.user_role add value if not exists 'headmaster';
alter type public.user_role add value if not exists 'academic_director';
alter type public.user_role add value if not exists 'supervisor';
alter type public.user_role add value if not exists 'secretary';
alter type public.user_role add value if not exists 'head_teacher';

alter table public.schools
  add column if not exists acronym text,
  add column if not exists neighborhood text,
  add column if not exists website text,
  add column if not exists stamp_url text,
  add column if not exists motto text,
  add column if not exists timezone text not null default 'Africa/Libreville',
  add column if not exists language_code text not null default 'fr',
  add column if not exists period_system text not null default 'trimester' check(period_system in ('trimester','semester'));

create table if not exists public.platform_workspaces(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_platform_workspaces_school on public.platform_workspaces(school_id);

create or replace function public.has_school_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or exists(
    select 1 from public.school_memberships sm
    where sm.school_id=target_school and sm.user_id=auth.uid()
      and sm.status='active' and sm.role::text=any(allowed_roles)
  );
$$;

alter table public.platform_workspaces enable row level security;
create policy platform_workspaces_read on public.platform_workspaces for select to authenticated
  using(user_id=auth.uid() or (school_id is not null and public.has_school_role(school_id,array['school_admin','headmaster'])));
create policy platform_workspaces_insert on public.platform_workspaces for insert to authenticated
  with check(user_id=auth.uid() and (school_id is null or public.belongs_to_school(school_id)));
create policy platform_workspaces_update on public.platform_workspaces for update to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid() and (school_id is null or public.belongs_to_school(school_id)));
create policy platform_workspaces_delete on public.platform_workspaces for delete to authenticated using(user_id=auth.uid());
drop trigger if exists trg_platform_workspaces_updated_at on public.platform_workspaces;
create trigger trg_platform_workspaces_updated_at before update on public.platform_workspaces for each row execute function public.set_updated_at();
