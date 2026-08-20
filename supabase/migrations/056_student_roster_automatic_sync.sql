-- Gabon Éduc+ v0.11.24 — synchronisation automatique dossier élève -> liste de classe

create or replace function public.sync_student_record_to_class_roster()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.class_group_id is null or new.status <> 'active' then
    delete from public.class_students where id = new.id;
    return new;
  end if;

  -- L'ancienne table interdit deux lignes portant le même nom dans une classe.
  -- Si une ligne historique existe déjà sous un autre identifiant, on la met à jour
  -- sans bloquer toute la migration.
  if exists(
    select 1 from public.class_students cs
    where cs.class_group_id = new.class_group_id
      and cs.first_name = new.first_name
      and cs.last_name = new.last_name
      and cs.id <> new.id
  ) then
    update public.class_students cs
    set email = new.email,
        registration_number = new.registration_number,
        date_of_birth = new.date_of_birth,
        updated_at = now()
    where cs.class_group_id = new.class_group_id
      and cs.first_name = new.first_name
      and cs.last_name = new.last_name;
    return new;
  end if;

  insert into public.class_students(
    id, class_group_id, first_name, last_name, email,
    registration_number, date_of_birth
  ) values (
    new.id, new.class_group_id, new.first_name, new.last_name, new.email,
    new.registration_number, new.date_of_birth
  )
  on conflict (id) do update set
    class_group_id = excluded.class_group_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    registration_number = excluded.registration_number,
    date_of_birth = excluded.date_of_birth,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_student_record_to_class_roster on public.student_records;
create trigger trg_student_record_to_class_roster
after insert or update of class_group_id, first_name, last_name, email,
  registration_number, date_of_birth, status
on public.student_records
for each row execute function public.sync_student_record_to_class_roster();

-- Répare immédiatement les élèves actifs déjà rattachés à une classe.
update public.student_records
set updated_at = now()
where class_group_id is not null and status = 'active';
