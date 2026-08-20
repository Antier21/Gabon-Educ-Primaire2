-- Gabon Éduc+ Primaire v0.12.0-primary.13
-- Résolution RLS sûre et rapide de l'établissement actif de la session.

create or replace function public.get_my_active_schools()
returns table (
  id uuid,
  name text,
  slug text,
  school_type text,
  school_sector text,
  registration_number text,
  province text,
  city text,
  district text,
  address text,
  phone text,
  email text,
  logo_url text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.slug,
    s.school_type,
    s.school_sector,
    s.registration_number,
    s.province,
    s.city,
    s.district,
    s.address,
    s.phone,
    s.email,
    s.logo_url,
    s.is_active,
    s.created_at,
    s.updated_at
  from public.schools s
  where s.is_active
    and exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = s.id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
    )
  order by s.created_at, s.id;
$$;

revoke all on function public.get_my_active_schools() from public;
grant execute on function public.get_my_active_schools() to authenticated;

comment on function public.get_my_active_schools()
is 'Renvoie uniquement les établissements actifs rattachés à la session authentifiée.';
