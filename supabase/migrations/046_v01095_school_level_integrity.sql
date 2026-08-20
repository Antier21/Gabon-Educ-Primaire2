-- v0.10.9.5 — intégrité établissement / niveau / classe
create or replace function public.level_allowed_for_school_type(p_school_type text, p_level_code text)
returns boolean
language sql
immutable
as $$
  select case coalesce(p_school_type, 'middle_school')
    when 'primary' then p_level_code = any(array['CP1','CP2','CE1','CE2','CM1','CM2'])
    when 'middle_school' then p_level_code = any(array['6e','5e','4e','3e'])
    when 'high_school' then p_level_code = any(array['2nde','1re','Terminale'])
    when 'complex_school' then p_level_code = any(array['CP1','CP2','CE1','CE2','CM1','CM2','6e','5e','4e','3e','2nde','1re','Terminale'])
    else false
  end;
$$;

create or replace function public.enforce_class_group_school_level()
returns trigger
language plpgsql
as $$
declare
  v_school_type text;
  v_level_code text;
begin
  select school_type into v_school_type from public.schools where id = new.school_id;
  select code into v_level_code from public.grade_levels where id = new.grade_level_id;
  if v_school_type is null then
    raise exception 'Établissement introuvable pour la classe';
  end if;
  if v_level_code is null then
    raise exception 'Niveau scolaire introuvable pour la classe';
  end if;
  if not public.level_allowed_for_school_type(v_school_type, v_level_code) then
    raise exception 'Le niveau % est incompatible avec le type d''établissement %', v_level_code, v_school_type;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_class_group_school_level on public.class_groups;
create trigger trg_class_group_school_level
before insert or update of school_id, grade_level_id on public.class_groups
for each row execute function public.enforce_class_group_school_level();

create index if not exists idx_class_groups_school_level
  on public.class_groups(school_id, grade_level_id, academic_year_id);
