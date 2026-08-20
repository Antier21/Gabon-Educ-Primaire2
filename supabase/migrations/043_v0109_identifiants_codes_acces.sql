-- Gabon Educ+ v0.10.9 — Identifiants et codes d'accès sans e-mail utilisateur
-- À exécuter après 042_v0102_establishment_onboarding_flow.sql

create extension if not exists citext;

create table if not exists public.access_credentials (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  identifier citext not null,
  auth_email text not null,
  display_name text not null,
  role public.user_role not null,
  status text not null default 'active' check (status in ('active','suspended','revoked')),
  must_change_password boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(identifier),
  unique(auth_email),
  unique(school_id, auth_user_id)
);

create index if not exists idx_access_credentials_school_status on public.access_credentials(school_id,status);
create index if not exists idx_access_credentials_auth_user on public.access_credentials(auth_user_id);

drop trigger if exists trg_access_credentials_updated_at on public.access_credentials;
create trigger trg_access_credentials_updated_at
before update on public.access_credentials
for each row execute function public.set_updated_at();

alter table public.access_credentials enable row level security;

drop policy if exists access_credentials_self_read on public.access_credentials;
create policy access_credentials_self_read on public.access_credentials
for select to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_super_admin()
  or public.has_school_role(school_id,array['school_admin','headmaster','secretary'])
);

drop policy if exists access_credentials_admin_write on public.access_credentials;
create policy access_credentials_admin_write on public.access_credentials
for all to authenticated
using (public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster','secretary']))
with check (public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster','secretary']));

-- Résolution légère pour un formulaire de connexion par identifiant.
-- Elle ne renvoie pas de vraie adresse personnelle, seulement l'e-mail technique Supabase.
create or replace function public.resolve_access_identifier(p_identifier text)
returns table(
  auth_email text,
  role text,
  school_id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select ac.auth_email, ac.role::text, ac.school_id, ac.display_name
  from public.access_credentials ac
  where ac.identifier = lower(trim(p_identifier))::citext
    and ac.status = 'active'
  limit 1;
$$;

revoke all on function public.resolve_access_identifier(text) from public;
grant execute on function public.resolve_access_identifier(text) to anon, authenticated;

-- Liste complète des utilisateurs visibles dans l'onglet Utilisateurs.
create or replace function public.list_school_access_users(p_school_id uuid)
returns table(
  id uuid,
  first_name text,
  last_name text,
  email text,
  auth_email text,
  access_identifier text,
  phone text,
  role text,
  status text,
  must_change_password boolean,
  scope_class_ids uuid[],
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.has_school_role(p_school_id, array['school_admin','headmaster','academic_director','secretary'])
     and not public.is_super_admin() then
    raise exception 'Accès refusé aux utilisateurs de cet établissement';
  end if;

  return query
  select
    p.id,
    p.first_name,
    p.last_name,
    u.email::text as email,
    coalesce(ac.auth_email,u.email::text) as auth_email,
    ac.identifier::text as access_identifier,
    p.phone,
    sm.role::text as role,
    case when sm.status = 'suspended' or ac.status = 'suspended' then 'suspended' else 'active' end as status,
    coalesce(ac.must_change_password,false) as must_change_password,
    sm.scope_class_ids,
    sm.created_at,
    sm.updated_at
  from public.school_memberships sm
  join public.profiles p on p.id = sm.user_id
  left join auth.users u on u.id = p.id
  left join public.access_credentials ac on ac.auth_user_id = p.id and ac.school_id = sm.school_id
  where sm.school_id = p_school_id
    and sm.status in ('active','suspended')
    and sm.invitation_status = 'accepted'
    and p.is_active
  order by p.last_name, p.first_name;
end;
$$;

revoke all on function public.list_school_access_users(uuid) from public;
grant execute on function public.list_school_access_users(uuid) to authenticated;

-- Alignement des anciens accès fictifs éventuellement créés par seed.
insert into public.access_credentials(
  school_id,
  auth_user_id,
  identifier,
  auth_email,
  display_name,
  role,
  status,
  must_change_password,
  created_by
)
select
  sm.school_id,
  sm.user_id,
  lower(regexp_replace(coalesce(p.first_name,'utilisateur') || '.' || coalesce(p.last_name,'gabon-educ') || '.' || right(sm.user_id::text,4), '[^a-zA-Z0-9._-]+', '-', 'g'))::citext,
  lower(regexp_replace(coalesce(p.first_name,'utilisateur') || '.' || coalesce(p.last_name,'gabon-educ') || '.' || right(sm.user_id::text,4), '[^a-zA-Z0-9._-]+', '-', 'g')) || '@access.gabon-educ.local',
  trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),
  sm.role,
  case when sm.status = 'suspended' then 'suspended' else 'active' end,
  true,
  sm.invited_by
from public.school_memberships sm
join public.profiles p on p.id = sm.user_id
left join public.access_credentials ac on ac.auth_user_id = sm.user_id and ac.school_id = sm.school_id
where ac.id is null
  and sm.invitation_status = 'accepted'
  and sm.role::text in ('teacher','head_teacher','supervisor','secretary','student','parent')
on conflict(identifier) do nothing;
