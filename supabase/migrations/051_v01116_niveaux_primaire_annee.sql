-- Gabon Éduc+ — Renommage des niveaux du primaire
-- CP1 · CP2 · CE1 · CE2 · CM1 · CM2  →  1ère Année … 6e Année
--
-- À exécuter dans Supabase (SQL Editor) AVANT ou juste après le déploiement.
-- La fonction de contrôle accepte les deux appellations : les données déjà
-- saisies sous les anciens codes restent donc valides, et rien ne casse si la
-- migration et le déploiement ne sont pas simultanés.

-- 1. Le contrôle d'intégrité accepte les nouveaux noms, sans rejeter les anciens.
create or replace function public.level_allowed_for_school_type(p_school_type text, p_level_code text)
returns boolean
language sql
immutable
as $$
  select case coalesce(p_school_type, 'middle_school')
    when 'primary' then p_level_code = any(array[
      '1ère Année','2e Année','3e Année','4e Année','5e Année','6e Année',
      'CP1','CP2','CE1','CE2','CM1','CM2'])
    when 'middle_school' then p_level_code = any(array['6e','5e','4e','3e'])
    when 'high_school' then p_level_code = any(array['2nde','1re','Terminale'])
    when 'complex_school' then p_level_code = any(array[
      '1ère Année','2e Année','3e Année','4e Année','5e Année','6e Année',
      'CP1','CP2','CE1','CE2','CM1','CM2',
      '6e','5e','4e','3e','2nde','1re','Terminale'])
    else false
  end;
$$;

-- 2. Renommage des niveaux déjà enregistrés.
--    Le libellé visible et le code sont alignés sur la nouvelle appellation.
update public.grade_levels set code = '1ère Année', name = '1ère Année' where code = 'CP1';
update public.grade_levels set code = '2e Année',   name = '2e Année'   where code = 'CP2';
update public.grade_levels set code = '3e Année',   name = '3e Année'   where code = 'CE1';
update public.grade_levels set code = '4e Année',   name = '4e Année'   where code = 'CE2';
update public.grade_levels set code = '5e Année',   name = '5e Année'   where code = 'CM1';
update public.grade_levels set code = '6e Année',   name = '6e Année'   where code = 'CM2';

-- 3. Mise à jour des espaces de travail stockés en JSON.
update public.platform_workspaces pw
set payload = jsonb_set(
  coalesce(pw.payload, '{}'::jsonb),
  '{levels}',
  coalesce((
    select jsonb_agg(
      case level_item->>'code'
        when 'CP1' then jsonb_set(jsonb_set(level_item, '{code}', '"1ère Année"'), '{name}', '"1ère Année"')
        when 'CP2' then jsonb_set(jsonb_set(level_item, '{code}', '"2e Année"'),   '{name}', '"2e Année"')
        when 'CE1' then jsonb_set(jsonb_set(level_item, '{code}', '"3e Année"'),   '{name}', '"3e Année"')
        when 'CE2' then jsonb_set(jsonb_set(level_item, '{code}', '"4e Année"'),   '{name}', '"4e Année"')
        when 'CM1' then jsonb_set(jsonb_set(level_item, '{code}', '"5e Année"'),   '{name}', '"5e Année"')
        when 'CM2' then jsonb_set(jsonb_set(level_item, '{code}', '"6e Année"'),   '{name}', '"6e Année"')
        else level_item
      end
    )
    from jsonb_array_elements(coalesce(pw.payload->'levels', '[]'::jsonb)) as level_item
  ), '[]'::jsonb),
  true
)
where pw.payload->'levels' is not null;

-- 4. Contrôle : plus aucun ancien code ne doit subsister.
--    select code, count(*) from public.grade_levels group by code order by code;
