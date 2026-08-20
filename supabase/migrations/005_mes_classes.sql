-- Gabon Éduc+ v0.7.0 — Module Mes classes
alter table public.class_groups
  alter column school_id drop not null,
  alter column academic_year_id drop not null,
  add column if not exists owner_teacher_id uuid references public.profiles(id) on delete cascade,
  add column if not exists updated_at timestamptz not null default now();

alter table public.class_groups drop constraint if exists class_groups_owner_required;
alter table public.class_groups add constraint class_groups_owner_required check (school_id is not null or owner_teacher_id is not null);
create index if not exists idx_class_groups_owner on public.class_groups(owner_teacher_id);

create table if not exists public.class_students (
  id uuid primary key default gen_random_uuid(),
  class_group_id uuid not null references public.class_groups(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 2 and 60),
  last_name text not null check (char_length(last_name) between 2 and 60),
  email text,
  created_at timestamptz not null default now(),
  unique(class_group_id, first_name, last_name)
);
alter table public.class_students enable row level security;

drop policy if exists teacher_classes_read on public.class_groups;
drop policy if exists teacher_classes_insert on public.class_groups;
drop policy if exists teacher_classes_update on public.class_groups;
drop policy if exists teacher_classes_delete on public.class_groups;
create policy teacher_classes_read on public.class_groups for select to authenticated using (owner_teacher_id = auth.uid() or public.belongs_to_school(school_id) or public.is_super_admin());
create policy teacher_classes_insert on public.class_groups for insert to authenticated with check (owner_teacher_id = auth.uid());
create policy teacher_classes_update on public.class_groups for update to authenticated using (owner_teacher_id = auth.uid()) with check (owner_teacher_id = auth.uid());
create policy teacher_classes_delete on public.class_groups for delete to authenticated using (owner_teacher_id = auth.uid());

drop policy if exists class_students_read on public.class_students;
drop policy if exists class_students_insert on public.class_students;
drop policy if exists class_students_update on public.class_students;
drop policy if exists class_students_delete on public.class_students;
create policy class_students_read on public.class_students for select to authenticated using (exists (select 1 from public.class_groups c where c.id = class_group_id and c.owner_teacher_id = auth.uid()));
create policy class_students_insert on public.class_students for insert to authenticated with check (exists (select 1 from public.class_groups c where c.id = class_group_id and c.owner_teacher_id = auth.uid()));
create policy class_students_update on public.class_students for update to authenticated using (exists (select 1 from public.class_groups c where c.id = class_group_id and c.owner_teacher_id = auth.uid()));
create policy class_students_delete on public.class_students for delete to authenticated using (exists (select 1 from public.class_groups c where c.id = class_group_id and c.owner_teacher_id = auth.uid()));

drop trigger if exists trg_class_groups_updated_at on public.class_groups;
create trigger trg_class_groups_updated_at before update on public.class_groups for each row execute function public.set_updated_at();
