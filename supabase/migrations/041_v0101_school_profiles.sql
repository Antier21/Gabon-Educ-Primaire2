-- Gabon Educ+ v0.10.1 — profils d’établissement
-- Périmètre retenu : primaire, collège général, lycée général ; public ou privé.

alter table public.schools
  add column if not exists school_sector text;

update public.schools
set school_type = case
  when school_type in ('primaire', 'primary') then 'primary'
  when school_type in ('lycee', 'lycée', 'high_school', 'lycee_general', 'lycée général') then 'high_school'
  when school_type in ('college', 'collège', 'secondaire', 'middle_school', 'collège général') then 'middle_school'
  else 'middle_school'
end;

update public.schools
set school_sector = case
  when school_sector = 'public' then 'public'
  else 'private'
end;

alter table public.schools drop constraint if exists schools_school_type_check;
alter table public.schools add constraint schools_school_type_check
  check (school_type in ('primary', 'middle_school', 'high_school'));

alter table public.schools drop constraint if exists schools_school_sector_check;
alter table public.schools add constraint schools_school_sector_check
  check (school_sector in ('public', 'private'));

alter table public.schools alter column school_type set default 'middle_school';
alter table public.schools alter column school_sector set default 'private';
alter table public.schools alter column school_type set not null;
alter table public.schools alter column school_sector set not null;
