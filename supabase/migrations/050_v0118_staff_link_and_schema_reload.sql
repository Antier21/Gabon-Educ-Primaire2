-- Gabon Éduc+ v0.11.8
-- Migration idempotente : garantit le lien RH -> profil pédagogique même si 049 n'a pas été appliquée.

alter table if exists public.school_staff
  add column if not exists pedagogical_user_id uuid;

do $$
begin
  if to_regclass('public.school_staff') is not null
     and to_regclass('public.profiles') is not null
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

create index if not exists idx_school_staff_pedagogical_user_id
  on public.school_staff(pedagogical_user_id);

notify pgrst, 'reload schema';
