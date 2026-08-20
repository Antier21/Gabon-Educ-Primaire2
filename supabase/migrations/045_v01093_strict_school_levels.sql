-- Gabon Éduc+ v0.10.9.3 — séparation stricte des niveaux par type d'établissement
-- Nettoie les anciens payloads de platform_workspaces pouvant contenir des niveaux d'un autre cycle.

update public.platform_workspaces pw
set payload = jsonb_set(
  coalesce(pw.payload, '{}'::jsonb),
  '{levels}',
  coalesce((
    select jsonb_agg(level_item)
    from jsonb_array_elements(coalesce(pw.payload->'levels', '[]'::jsonb)) as level_item
    where case coalesce((select s.school_type from public.schools s where s.id = pw.school_id), 'middle_school')
      when 'primary' then level_item->>'code' in ('CP1','CP2','CE1','CE2','CM1','CM2')
      when 'middle_school' then level_item->>'code' in ('6e','5e','4e','3e')
      when 'high_school' then level_item->>'code' in ('2nde','1re','Terminale')
      when 'complex_school' then level_item->>'code' in ('CP1','CP2','CE1','CE2','CM1','CM2','6e','5e','4e','3e','2nde','1re','Terminale')
      else false
    end
  ), '[]'::jsonb),
  true
)
where pw.school_id is not null;
