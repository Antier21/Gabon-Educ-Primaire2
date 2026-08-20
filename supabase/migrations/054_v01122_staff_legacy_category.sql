-- Gabon Éduc+ v0.11.22 — compatibilité avec l'ancienne colonne school_staff.category
-- Idempotent : peut être exécuté plusieurs fois sans supprimer de données.

alter table public.school_staff
  add column if not exists category text;

update public.school_staff
set category = coalesce(nullif(trim(category), ''), nullif(trim(staff_category), ''), 'other')
where category is null or trim(category) = '';

alter table public.school_staff
  alter column category set default 'other';

alter table public.school_staff
  alter column category set not null;

create or replace function public.sync_school_staff_categories()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.staff_category := coalesce(
    nullif(trim(new.staff_category), ''),
    nullif(trim(new.category), ''),
    'other'
  );
  new.category := new.staff_category;
  return new;
end;
$$;

drop trigger if exists trg_school_staff_categories on public.school_staff;
create trigger trg_school_staff_categories
before insert or update of staff_category, category on public.school_staff
for each row execute function public.sync_school_staff_categories();

notify pgrst, 'reload schema';
