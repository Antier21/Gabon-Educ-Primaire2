-- Gabon Éduc+ Primaire v0.12.0-primary.3
-- Le primaire gabonais comporte cinq classes : 1ère à 5e Année.
-- Les anciens codes restent acceptés en lecture pour ne pas casser les données,
-- mais tout nouvel établissement reçoit uniquement les cinq niveaux canoniques.

create or replace function public.default_school_level_codes(requested_school_type text)
returns text[]
language plpgsql
stable
as $$
begin
  if requested_school_type = 'primary' then
    return array['1ère Année','2e Année','3e Année','4e Année','5e Année'];
  elsif requested_school_type = 'high_school' then
    return array['2nde','1re','Terminale'];
  elsif requested_school_type = 'complex_school' then
    return array['6e','5e','4e','3e','2nde','1re','Terminale'];
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
    when level_code in (
      '1ère Année','2e Année','3e Année','4e Année','5e Année',
      'CP','CP1','CP2','CE1','CE2','CM1','CM2','6e Année'
    ) then 'Primaire'
    when level_code in ('6e','5e','4e','3e','2nde','1re','Terminale') then 'Secondaire'
    else 'Inconnu'
  end;
$$;

create or replace function public.level_allowed_for_school_type(p_school_type text, p_level_code text)
returns boolean
language sql
immutable
as $$
  select case coalesce(p_school_type, 'middle_school')
    when 'primary' then p_level_code = any(array[
      '1ère Année','2e Année','3e Année','4e Année','5e Année',
      'CP','CP1','CP2','CE1','CE2','CM1','CM2','6e Année'])
    when 'middle_school' then p_level_code = any(array['6e','5e','4e','3e'])
    when 'high_school' then p_level_code = any(array['2nde','1re','Terminale'])
    when 'complex_school' then p_level_code = any(array['6e','5e','4e','3e','2nde','1re','Terminale'])
    else false
  end;
$$;

grant execute on function public.default_school_level_codes(text) to authenticated;
grant execute on function public.level_cycle_from_code(text) to authenticated;

comment on function public.default_school_level_codes(text)
is 'Niveaux par édition : cinq années au primaire, 6e à Terminale au secondaire.';
