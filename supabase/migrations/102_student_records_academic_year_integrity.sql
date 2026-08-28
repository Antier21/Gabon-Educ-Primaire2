-- Gabon Éduc+ Primaire — intégrité classe/établissement/année des dossiers élèves

do $$
begin
  if exists(
    select 1
    from public.student_records sr
    join public.class_groups cg on cg.id = sr.class_group_id
    where sr.class_group_id is not null
      and sr.school_id is distinct from cg.school_id
  ) then
    raise exception 'Migration 102 interrompue : au moins un dossier élève référence une classe d’un autre établissement.';
  end if;
end;
$$;

-- La classe est la source d’autorité pour l’année scolaire du dossier.
update public.student_records sr
set academic_year_id = cg.academic_year_id,
    updated_at = now()
from public.class_groups cg
where cg.id = sr.class_group_id
  and sr.class_group_id is not null
  and sr.academic_year_id is distinct from cg.academic_year_id;

create or replace function public.enforce_student_record_class_academic_year()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_school uuid;
  resolved_year uuid;
begin
  if new.class_group_id is null then
    return new;
  end if;

  select cg.school_id, cg.academic_year_id
  into resolved_school, resolved_year
  from public.class_groups cg
  where cg.id = new.class_group_id;

  if not found then
    raise exception 'La classe sélectionnée est introuvable.';
  end if;
  if resolved_school is distinct from new.school_id then
    raise exception 'La classe sélectionnée appartient à un autre établissement.';
  end if;

  new.academic_year_id := resolved_year;
  return new;
end;
$$;

revoke all on function public.enforce_student_record_class_academic_year() from public, anon, authenticated;

drop trigger if exists trg_student_records_class_academic_year on public.student_records;
create trigger trg_student_records_class_academic_year
before insert or update of school_id, class_group_id, academic_year_id
on public.student_records
for each row execute function public.enforce_student_record_class_academic_year();

create index if not exists idx_student_records_school_year_class_status
on public.student_records(school_id, academic_year_id, class_group_id, status);

notify pgrst, 'reload schema';
