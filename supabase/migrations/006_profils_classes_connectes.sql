-- Gabon Éduc+ v0.7.0 — Profils enseignants et enrichissement de Mes classes
alter table public.profiles
  add column if not exists school_name text,
  add column if not exists main_subject text,
  add column if not exists main_grade text;

alter table public.class_groups
  add column if not exists academic_year_label text not null default '2026-2027',
  add column if not exists main_subject text;

alter table public.class_students
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_class_students_updated_at on public.class_students;
create trigger trg_class_students_updated_at before update on public.class_students
for each row execute function public.set_updated_at();

create index if not exists idx_class_students_name on public.class_students(class_group_id,last_name,first_name);
create index if not exists idx_class_groups_teacher_year on public.class_groups(owner_teacher_id,academic_year_label);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare requested_role public.user_role;
begin
  requested_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role,'teacher'::public.user_role);
  if requested_role not in ('teacher','student','parent') then requested_role := 'teacher'::public.user_role; end if;
  insert into public.profiles(id,first_name,last_name,display_name,phone,city,school_name)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'first_name',''),'Utilisateur'),coalesce(nullif(new.raw_user_meta_data->>'last_name',''),'Gabon Éduc+'),nullif(new.raw_user_meta_data->>'display_name',''),nullif(new.raw_user_meta_data->>'phone',''),nullif(new.raw_user_meta_data->>'city',''),nullif(new.raw_user_meta_data->>'school_name',''))
  on conflict(id) do update set first_name=excluded.first_name,last_name=excluded.last_name,city=coalesce(excluded.city,profiles.city),school_name=coalesce(excluded.school_name,profiles.school_name);
  insert into public.user_roles(user_id,role) values(new.id,requested_role) on conflict do nothing;
  return new;
end;
$$;
