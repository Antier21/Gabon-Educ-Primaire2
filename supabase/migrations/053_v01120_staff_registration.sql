-- Gabon Éduc+ v0.11.20 — enregistrement fiable du personnel
-- Cette migration est idempotente et peut être rejouée sans supprimer de données.

-- Le fichier est autonome : il répare également une ancienne table incomplète.
create table if not exists public.school_staff(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  employee_number text not null,
  first_name text not null,
  last_name text not null
);

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

-- On sécurise les valeurs historiques et les droits nécessaires au client Supabase.
update public.school_staff set job_title = 'Personnel' where job_title is null or trim(job_title) = '';
update public.school_staff set hire_date = current_date where hire_date is null;
update public.school_staff set contract_type = 'Autre' where contract_type is null or trim(contract_type) = '';
update public.school_staff set employment_status = 'active' where employment_status is null or trim(employment_status) = '';
update public.school_staff set years_experience = 0 where years_experience is null or years_experience < 0;

alter table public.school_staff alter column job_title set default 'Personnel';
alter table public.school_staff alter column hire_date set default current_date;
alter table public.school_staff alter column contract_type set default 'Autre';
alter table public.school_staff alter column employment_status set default 'active';
alter table public.school_staff alter column years_experience set default 0;
alter table public.school_staff alter column created_by set default auth.uid();

grant select, insert, update, delete on table public.school_staff to authenticated;

alter table public.school_staff enable row level security;
drop policy if exists school_staff_member_read on public.school_staff;
create policy school_staff_member_read on public.school_staff for select to authenticated
using (public.belongs_to_school(school_id));

drop policy if exists school_staff_admin_write on public.school_staff;
create policy school_staff_admin_write on public.school_staff for all to authenticated
using (public.has_school_role(school_id, array['school_admin','headmaster','secretary']))
with check (public.has_school_role(school_id, array['school_admin','headmaster','secretary']));

notify pgrst, 'reload schema';
