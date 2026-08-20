-- Gabon Éduc+ v0.7.0 — Configuration scolaire, périodes et affectations
alter type public.user_role add value if not exists 'head_teacher';
alter type public.user_role add value if not exists 'headmaster';

alter table public.class_students
  add column if not exists registration_number text,
  add column if not exists date_of_birth date;

alter table public.schools
  add column if not exists head_name text,
  add column if not exists bulletin_model text not null default 'Standard A4',
  add column if not exists default_max_score numeric(7,2) not null default 20 check(default_max_score > 0),
  add column if not exists pass_threshold numeric(7,2) not null default 10 check(pass_threshold >= 0),
  add column if not exists rounding_decimals smallint not null default 2 check(rounding_decimals between 0 and 4);

create table if not exists public.grading_workspaces(
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grading_periods(
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_year_label text not null,
  label text not null check(char_length(label) between 2 and 100),
  period_kind text not null check(period_kind in ('trimester','semester')),
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default false,
  is_locked boolean not null default false,
  locked_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_on >= starts_on),
  unique(owner_teacher_id, academic_year_label, label)
);

create table if not exists public.class_subjects(
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_group_id uuid not null references public.class_groups(id) on delete cascade,
  grading_period_id uuid not null references public.grading_periods(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  subject_name text not null,
  coefficient numeric(8,3) not null check(coefficient > 0),
  assigned_teacher_id uuid references public.profiles(id) on delete set null,
  is_head_teacher boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_group_id, grading_period_id, subject_name)
);

create index if not exists idx_grading_periods_owner_active on public.grading_periods(owner_teacher_id,is_active);
create index if not exists idx_grading_periods_school_year on public.grading_periods(school_id,academic_year_label);
create index if not exists idx_class_subjects_class_period on public.class_subjects(class_group_id,grading_period_id,is_active);
create index if not exists idx_class_subjects_teacher on public.class_subjects(assigned_teacher_id);

alter table public.grading_workspaces enable row level security;
alter table public.grading_periods enable row level security;
alter table public.class_subjects enable row level security;

create policy grading_workspaces_owner_all on public.grading_workspaces for all to authenticated
  using(teacher_id=auth.uid() or public.is_super_admin())
  with check(teacher_id=auth.uid() or public.is_super_admin());
create policy grading_periods_owner_read on public.grading_periods for select to authenticated
  using(owner_teacher_id=auth.uid() or public.belongs_to_school(school_id) or public.is_super_admin());
create policy grading_periods_owner_write on public.grading_periods for all to authenticated
  using(owner_teacher_id=auth.uid() or public.is_super_admin())
  with check(owner_teacher_id=auth.uid() or public.is_super_admin());
create policy class_subjects_assigned_read on public.class_subjects for select to authenticated
  using(owner_teacher_id=auth.uid() or assigned_teacher_id=auth.uid() or public.is_super_admin());
create policy class_subjects_owner_write on public.class_subjects for all to authenticated
  using(owner_teacher_id=auth.uid() or public.is_super_admin())
  with check(owner_teacher_id=auth.uid() or public.is_super_admin());

create or replace function public.can_manage_grading_lock()
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or exists(
    select 1 from public.user_roles ur
    where ur.user_id=auth.uid() and ur.role::text in ('school_admin','headmaster')
  );
$$;

create or replace function public.restrict_grading_period_lock()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_locked is distinct from old.is_locked and not public.can_manage_grading_lock() then
    raise exception 'Seuls les rôles autorisés peuvent verrouiller ou rouvrir une période.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_grading_period_lock on public.grading_periods;
create trigger trg_restrict_grading_period_lock before update on public.grading_periods for each row execute function public.restrict_grading_period_lock();

drop trigger if exists trg_grading_workspaces_updated_at on public.grading_workspaces;
create trigger trg_grading_workspaces_updated_at before update on public.grading_workspaces for each row execute function public.set_updated_at();
drop trigger if exists trg_grading_periods_updated_at on public.grading_periods;
create trigger trg_grading_periods_updated_at before update on public.grading_periods for each row execute function public.set_updated_at();
drop trigger if exists trg_class_subjects_updated_at on public.class_subjects;
create trigger trg_class_subjects_updated_at before update on public.class_subjects for each row execute function public.set_updated_at();
