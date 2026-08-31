-- Gabon Éduc+ Primaire — géolocalisation des établissements dans le centre de pilotage
-- Migration volontairement isolée : elle peut être appliquée manuellement sans rejouer
-- l'historique divergent des migrations précédentes.

alter table public.schools
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_source text,
  add column if not exists location_updated_at timestamptz,
  add column if not exists location_updated_by uuid references auth.users(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'schools_latitude_range_check'
  ) then
    alter table public.schools
      add constraint schools_latitude_range_check
      check (latitude is null or latitude between -90 and 90);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'schools_longitude_range_check'
  ) then
    alter table public.schools
      add constraint schools_longitude_range_check
      check (longitude is null or longitude between -180 and 180);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'schools_location_pair_check'
  ) then
    alter table public.schools
      add constraint schools_location_pair_check
      check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null));
  end if;
end $$;

comment on column public.schools.latitude is 'Latitude GPS de l établissement, définie par le super administrateur.';
comment on column public.schools.longitude is 'Longitude GPS de l établissement, définie par le super administrateur.';
comment on column public.schools.location_source is 'Origine de la position : map, manual, gps ou geocoded.';

create or replace function public.set_school_location(
  p_school_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_source text default 'map'
)
returns table(
  school_id uuid,
  latitude double precision,
  longitude double precision,
  location_source text,
  location_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school public.schools%rowtype;
  v_source text;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Accès réservé au super administrateur.' using errcode = '42501';
  end if;

  if p_school_id is null then
    raise exception 'Établissement absent.' using errcode = '22023';
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude et longitude doivent être renseignées ensemble.' using errcode = '22023';
  end if;

  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'Latitude invalide.' using errcode = '22023';
  end if;

  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'Longitude invalide.' using errcode = '22023';
  end if;

  v_source := lower(btrim(coalesce(p_source, 'map')));
  if v_source not in ('map', 'manual', 'gps', 'geocoded') then
    v_source := 'manual';
  end if;

  update public.schools
  set
    latitude = p_latitude,
    longitude = p_longitude,
    location_source = case when p_latitude is null then null else v_source end,
    location_updated_at = case when p_latitude is null then null else now() end,
    location_updated_by = case when p_latitude is null then null else auth.uid() end
  where id = p_school_id
  returning * into v_school;

  if not found then
    raise exception 'Établissement introuvable.' using errcode = 'P0002';
  end if;

  return query
  select
    v_school.id,
    v_school.latitude,
    v_school.longitude,
    v_school.location_source,
    v_school.location_updated_at;
end;
$$;

revoke all on function public.set_school_location(uuid, double precision, double precision, text) from public, anon;
grant execute on function public.set_school_location(uuid, double precision, double precision, text) to authenticated;

notify pgrst, 'reload schema';
