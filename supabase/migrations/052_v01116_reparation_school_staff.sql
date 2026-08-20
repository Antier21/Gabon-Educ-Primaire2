-- Gabon Éduc+ — Réparation du registre RH (public.school_staff)
--
-- À exécuter si la migration 048_v0112_school_staff.sql échoue avec
--   ERROR: 42703: column "employment_status" does not exist
--
-- Cause : la table school_staff existe déjà, dans une version plus ancienne qui
-- ne comporte pas toutes les colonnes. « create table if not exists » ne fait
-- alors rien du tout, et la création de l'index sur une colonne absente échoue.
--
-- Ce fichier ajoute chaque colonne manquante une par une. Il peut être exécuté
-- plusieurs fois sans dommage : ce qui existe déjà est laissé tel quel.

-- 1. La table, si elle n'existe pas encore.
create table if not exists public.school_staff(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  employee_number text not null,
  first_name text not null,
  last_name text not null
);

-- 2. Toutes les colonnes attendues par l'application.
alter table public.school_staff add column if not exists gender text;
alter table public.school_staff add column if not exists date_of_birth date;
alter table public.school_staff add column if not exists place_of_birth text;
alter table public.school_staff add column if not exists nationality text;
alter table public.school_staff add column if not exists marital_status text;
alter table public.school_staff add column if not exists phone text;
alter table public.school_staff add column if not exists email text;
alter table public.school_staff add column if not exists address text;
alter table public.school_staff add column if not exists emergency_contact_name text;
alter table public.school_staff add column if not exists emergency_contact_phone text;
alter table public.school_staff add column if not exists national_id_number text;
alter table public.school_staff add column if not exists cnss_number text;
alter table public.school_staff add column if not exists staff_category text not null default 'other';
alter table public.school_staff add column if not exists job_title text;
alter table public.school_staff add column if not exists department text;
alter table public.school_staff add column if not exists employment_status text not null default 'active';
alter table public.school_staff add column if not exists hire_date date;
alter table public.school_staff add column if not exists contract_type text;
alter table public.school_staff add column if not exists contract_start date;
alter table public.school_staff add column if not exists contract_end date;
alter table public.school_staff add column if not exists work_schedule text;
alter table public.school_staff add column if not exists highest_diploma text;
alter table public.school_staff add column if not exists specialty text;
alter table public.school_staff add column if not exists years_experience integer not null default 0;
alter table public.school_staff add column if not exists previous_employer text;
alter table public.school_staff add column if not exists administrative_notes text;
alter table public.school_staff add column if not exists pedagogical_user_id uuid;
alter table public.school_staff add column if not exists created_by uuid default auth.uid();
alter table public.school_staff add column if not exists created_at timestamptz not null default now();
alter table public.school_staff add column if not exists updated_at timestamptz not null default now();

-- 3. Contraintes et liens, seulement s'ils n'existent pas déjà.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'school_staff_years_experience_check'
      and conrelid = 'public.school_staff'::regclass
  ) then
    alter table public.school_staff
      add constraint school_staff_years_experience_check check (years_experience >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'school_staff_school_id_employee_number_key'
      and conrelid = 'public.school_staff'::regclass
  ) then
    alter table public.school_staff
      add constraint school_staff_school_id_employee_number_key unique (school_id, employee_number);
  end if;

  if to_regclass('public.profiles') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'school_staff_pedagogical_user_id_fkey'
         and conrelid = 'public.school_staff'::regclass
     ) then
    alter table public.school_staff
      add constraint school_staff_pedagogical_user_id_fkey
      foreign key (pedagogical_user_id) references public.profiles(id) on delete set null;
  end if;
end $$;

-- 4. Index — les colonnes existent désormais.
create index if not exists idx_school_staff_school_status
  on public.school_staff(school_id, employment_status);
create index if not exists idx_school_staff_school_category
  on public.school_staff(school_id, staff_category);

-- 5. Sécurité au niveau des lignes.
alter table public.school_staff enable row level security;

drop policy if exists school_staff_member_read on public.school_staff;
create policy school_staff_member_read on public.school_staff for select to authenticated
using (public.belongs_to_school(school_id));

drop policy if exists school_staff_admin_write on public.school_staff;
create policy school_staff_admin_write on public.school_staff for all to authenticated
using (public.has_school_role(school_id, array['school_admin','headmaster','secretary']))
with check (public.has_school_role(school_id, array['school_admin','headmaster','secretary']));

drop trigger if exists trg_school_staff_updated_at on public.school_staff;
create trigger trg_school_staff_updated_at before update on public.school_staff
for each row execute function public.set_updated_at();

-- 6. Rafraîchit le cache de schéma de l'API Supabase.
notify pgrst, 'reload schema';

-- 7. Contrôle : la liste doit contenir employment_status.
--    select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'school_staff' order by column_name;
