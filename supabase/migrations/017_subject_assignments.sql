-- Gabon Éduc+ v0.8.0 — matières d'établissement et affectations datées
create table if not exists public.school_subjects(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,school_level_id uuid references public.school_levels(id) on delete set null,
  code text not null,label text not null,color text,icon text,coefficient numeric(8,3) not null default 1 check(coefficient>0),
  weekly_hours numeric(6,2) not null default 0 check(weekly_hours>=0),category text,bulletin_order integer not null default 0,is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,code)
);
create table if not exists public.school_teaching_assignments(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,class_group_id uuid not null references public.class_groups(id) on delete cascade,
  school_subject_id uuid not null references public.school_subjects(id) on delete cascade,teacher_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date,ends_on date,is_temporary boolean not null default false,is_head_teacher boolean not null default false,is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(academic_year_id,class_group_id,school_subject_id,teacher_id)
);
create index if not exists idx_school_subjects_school_active on public.school_subjects(school_id,is_active,bulletin_order);
create index if not exists idx_school_assignments_teacher on public.school_teaching_assignments(school_id,teacher_id,is_active);
create index if not exists idx_school_assignments_class on public.school_teaching_assignments(school_id,class_group_id,is_active);
create or replace function public.can_access_school_class(target_school uuid,target_class uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin()
    or public.has_school_role(target_school,array['school_admin','headmaster','academic_director','supervisor','secretary'])
    or exists(select 1 from public.school_teaching_assignments sta where sta.school_id=target_school and sta.class_group_id=target_class and sta.teacher_id=auth.uid() and sta.is_active)
    or exists(select 1 from public.school_memberships sm where sm.school_id=target_school and sm.user_id=auth.uid() and sm.status='active' and target_class=any(sm.scope_class_ids));
$$;
alter table public.school_subjects enable row level security;alter table public.school_teaching_assignments enable row level security;
create policy school_subjects_member_read on public.school_subjects for select to authenticated using(public.belongs_to_school(school_id));
create policy school_subjects_admin_write on public.school_subjects for all to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','academic_director'])) with check(public.has_school_role(school_id,array['school_admin','headmaster','academic_director']));
create policy school_assignments_member_read on public.school_teaching_assignments for select to authenticated using(public.belongs_to_school(school_id));
create policy school_assignments_admin_write on public.school_teaching_assignments for all to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster','academic_director'])) with check(public.has_school_role(school_id,array['school_admin','headmaster','academic_director']));
drop policy if exists student_records_staff_read on public.student_records;
create policy student_records_scoped_read on public.student_records for select to authenticated using(public.can_access_school_class(school_id,class_group_id));
drop policy if exists guardians_staff_read on public.guardians;
create policy guardians_scoped_read on public.guardians for select to authenticated using(profile_id=auth.uid() or public.has_school_role(school_id,array['school_admin','headmaster','secretary','supervisor']) or exists(select 1 from public.guardian_student_links gsl join public.student_records sr on sr.id=gsl.student_id where gsl.guardian_id=guardians.id and public.can_access_school_class(sr.school_id,sr.class_group_id)));
drop trigger if exists trg_school_subjects_updated_at on public.school_subjects;create trigger trg_school_subjects_updated_at before update on public.school_subjects for each row execute function public.set_updated_at();
drop trigger if exists trg_school_assignments_updated_at on public.school_teaching_assignments;create trigger trg_school_assignments_updated_at before update on public.school_teaching_assignments for each row execute function public.set_updated_at();
