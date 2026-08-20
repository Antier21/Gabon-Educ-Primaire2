-- Gabon Éduc+ v0.10.9.8
-- Restaure l'API RPC d'onboarding des établissements sans rejouer l'ancienne migration 042.
-- Cette migration est volontairement ciblée et compatible avec les migrations 045/046.

create or replace function public.default_school_level_codes(requested_school_type text)
returns text[]
language plpgsql
stable
as $$
begin
  if requested_school_type = 'primary' then
    return array['CP1','CP2','CE1','CE2','CM1','CM2'];
  elsif requested_school_type = 'high_school' then
    return array['2nde','1re','Terminale'];
  elsif requested_school_type = 'complex_school' then
    return array['CP1','CP2','CE1','CE2','CM1','CM2','6e','5e','4e','3e','2nde','1re','Terminale'];
  else
    return array['6e','5e','4e','3e'];
  end if;
end;
$$;

create or replace function public.level_cycle_from_code(level_code text)
returns text
language sql
stable
as $$
  select case
    when level_code in ('CP1','CP2','CE1','CE2','CM1','CM2') then 'Primaire'
    when level_code in ('6e','5e','4e','3e') then 'Collège'
    when level_code in ('2nde','1re','Terminale') then 'Lycée'
    else 'Inconnu'
  end;
$$;

create or replace function public.register_school_from_onboarding(
  school_name text,
  requested_school_type text,
  requested_school_sector text,
  registration_number text default '',
  province_name text default 'Estuaire',
  city_name text default 'Libreville',
  school_address text default '',
  school_phone text default '',
  school_email text default '',
  academic_year_label text default '2026-2027'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  created_school_id uuid;
  created_year_id uuid;
  normalized_type text := coalesce(nullif(trim(requested_school_type), ''), 'middle_school');
  normalized_sector text := coalesce(nullif(trim(requested_school_sector), ''), 'private');
  generated_slug text;
  level_code text;
  year_start integer;
begin
  if current_user_id is null then
    raise exception 'Utilisateur non connecté.';
  end if;

  if trim(coalesce(school_name, '')) = '' then
    raise exception 'Le nom de l’établissement est obligatoire.';
  end if;

  if normalized_type not in ('primary','middle_school','high_school','complex_school') then
    raise exception 'Type d’établissement non pris en charge : %', normalized_type;
  end if;

  if normalized_sector not in ('public','private') then
    raise exception 'Secteur d’établissement non pris en charge : %', normalized_sector;
  end if;

  generated_slug := regexp_replace(lower(trim(school_name)), '[^a-z0-9]+', '-', 'g');
  generated_slug := trim(both '-' from generated_slug);
  if generated_slug = '' then
    generated_slug := 'etablissement';
  end if;
  generated_slug := generated_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.schools(
    name, slug, school_type, school_sector, registration_number,
    province, city, address, phone, email, is_active
  ) values (
    trim(school_name), generated_slug, normalized_type, normalized_sector,
    nullif(trim(coalesce(registration_number, '')), ''),
    nullif(trim(coalesce(province_name, '')), ''),
    nullif(trim(coalesce(city_name, '')), ''),
    nullif(trim(coalesce(school_address, '')), ''),
    nullif(trim(coalesce(school_phone, '')), ''),
    nullif(trim(coalesce(school_email, '')), ''),
    true
  ) returning id into created_school_id;

  insert into public.school_memberships(school_id, user_id, role, status, invitation_status)
  values (created_school_id, current_user_id, 'headmaster'::public.user_role, 'active', 'accepted')
  on conflict do nothing;

  insert into public.school_memberships(school_id, user_id, role, status, invitation_status)
  values (created_school_id, current_user_id, 'school_admin'::public.user_role, 'active', 'accepted')
  on conflict do nothing;

  begin
    year_start := nullif(split_part(coalesce(academic_year_label, ''), '-', 1), '')::integer;
  exception when others then
    year_start := null;
  end;
  if year_start is null then
    year_start := extract(year from current_date)::integer;
  end if;

  insert into public.academic_years(school_id, label, starts_on, ends_on, is_current, is_archived)
  values (
    created_school_id,
    coalesce(nullif(trim(academic_year_label), ''), year_start::text || '-' || (year_start + 1)::text),
    make_date(year_start, 9, 1),
    make_date(year_start + 1, 7, 31),
    true,
    false
  )
  returning id into created_year_id;

  insert into public.school_periods(school_id, academic_year_id, label, period_kind, is_active)
  values
    (created_school_id, created_year_id, 'Trimestre 1', 'trimester', true),
    (created_school_id, created_year_id, 'Trimestre 2', 'trimester', false),
    (created_school_id, created_year_id, 'Trimestre 3', 'trimester', false)
  on conflict do nothing;

  foreach level_code in array public.default_school_level_codes(normalized_type)
  loop
    insert into public.school_levels(school_id, code, label, cycle, is_active)
    values (created_school_id, level_code, level_code, public.level_cycle_from_code(level_code), true)
    on conflict do nothing;
  end loop;

  return created_school_id;
end;
$$;

revoke all on function public.register_school_from_onboarding(text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.register_school_from_onboarding(text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.default_school_level_codes(text) to authenticated;
grant execute on function public.level_cycle_from_code(text) to authenticated;

comment on function public.register_school_from_onboarding(text,text,text,text,text,text,text,text,text,text)
is 'Crée un établissement depuis l’onboarding et initialise memberships, année scolaire, périodes et niveaux autorisés.';
