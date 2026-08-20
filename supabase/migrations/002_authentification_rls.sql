-- Gabon Éduc+ — Migration 002
-- Authentification Supabase + profils automatiques + sécurité RLS
-- À exécuter APRÈS gabon_educ_plus_schema.sql

-- =========================================================
-- 1. RELIER LES PROFILS À SUPABASE AUTH
-- =========================================================
alter table public.profiles
  add constraint profiles_auth_user_fk
  foreign key (id) references auth.users(id) on delete cascade;

-- =========================================================
-- 2. CREATION AUTOMATIQUE DU PROFIL APRÈS INSCRIPTION
-- Les champs first_name, last_name et role sont transmis dans
-- options.data lors de signUp côté application.
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role public.user_role;
begin
  requested_role := coalesce(
    nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role,
    'teacher'::public.user_role
  );

  insert into public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    phone
  ) values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'first_name', ''), 'Utilisateur'),
    coalesce(nullif(new.raw_user_meta_data ->> 'last_name', ''), 'Gabon Éduc+'),
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  );

  -- Pour le MVP public, seuls teacher, student et parent sont acceptés.
  -- Les rôles sensibles sont attribués ensuite par un super administrateur.
  if requested_role not in ('teacher', 'student', 'parent') then
    requested_role := 'teacher'::public.user_role;
  end if;

  insert into public.user_roles (user_id, role)
  values (new.id, requested_role)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================
-- 3. FONCTIONS DE SECURITE
-- =========================================================
create or replace function public.has_role(required_role public.user_role)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = required_role
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.has_role('super_admin'::public.user_role);
$$;

create or replace function public.belongs_to_school(target_school uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.school_memberships sm
    where sm.user_id = auth.uid()
      and sm.school_id = target_school
      and sm.status = 'active'
  );
$$;

-- =========================================================
-- 4. ACTIVER ROW LEVEL SECURITY
-- =========================================================
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.academic_years enable row level security;
alter table public.grade_levels enable row level security;
alter table public.subjects enable row level security;
alter table public.class_groups enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.teaching_assignments enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.curricula enable row level security;
alter table public.curriculum_units enable row level security;
alter table public.competencies enable row level security;
alter table public.learning_objectives enable row level security;
alter table public.weekly_progressions enable row level security;
alter table public.lesson_plans enable row level security;
alter table public.lesson_steps enable row level security;
alter table public.resources enable row level security;
alter table public.lesson_resources enable row level security;
alter table public.question_banks enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.ai_generations enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- =========================================================
-- 5. PROFILS ET ROLES
-- =========================================================
create policy "profile_read_own"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_super_admin());

create policy "profile_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_super_admin())
with check (id = auth.uid() or public.is_super_admin());

create policy "roles_read_own"
on public.user_roles for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "roles_admin_manage"
on public.user_roles for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- =========================================================
-- 6. DONNEES DE REFERENCE PUBLIQUES
-- =========================================================
create policy "academic_years_authenticated_read"
on public.academic_years for select
to authenticated using (true);

create policy "grade_levels_public_read"
on public.grade_levels for select
to anon, authenticated using (is_active = true);

create policy "subjects_public_read"
on public.subjects for select
to anon, authenticated using (is_active = true);

create policy "plans_public_read"
on public.plans for select
to anon, authenticated using (is_active = true);

-- Administration des référentiels
create policy "reference_admin_manage_years"
on public.academic_years for all
to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "reference_admin_manage_levels"
on public.grade_levels for all
to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "reference_admin_manage_subjects"
on public.subjects for all
to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "reference_admin_manage_plans"
on public.plans for all
to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- =========================================================
-- 7. PROGRAMMES OFFICIELS
-- Tout utilisateur connecté lit les programmes publiés.
-- Inspecteurs et super administrateurs les gèrent.
-- =========================================================
create policy "curricula_read_published"
on public.curricula for select
to authenticated
using (status = 'published' or created_by = auth.uid() or public.has_role('inspector') or public.is_super_admin());

create policy "curricula_inspector_manage"
on public.curricula for all
to authenticated
using (public.has_role('inspector') or public.is_super_admin())
with check (public.has_role('inspector') or public.is_super_admin());

create policy "curriculum_units_read"
on public.curriculum_units for select
to authenticated
using (exists (
  select 1 from public.curricula c
  where c.id = curriculum_id
    and (c.status = 'published' or c.created_by = auth.uid() or public.has_role('inspector') or public.is_super_admin())
));
create policy "curriculum_units_manage"
on public.curriculum_units for all
to authenticated using (public.has_role('inspector') or public.is_super_admin())
with check (public.has_role('inspector') or public.is_super_admin());

create policy "competencies_read"
on public.competencies for select
to authenticated
using (exists (
  select 1 from public.curricula c
  where c.id = curriculum_id
    and (c.status = 'published' or c.created_by = auth.uid() or public.has_role('inspector') or public.is_super_admin())
));
create policy "competencies_manage"
on public.competencies for all
to authenticated using (public.has_role('inspector') or public.is_super_admin())
with check (public.has_role('inspector') or public.is_super_admin());

create policy "learning_objectives_read"
on public.learning_objectives for select
to authenticated
using (exists (
  select 1 from public.curriculum_units cu
  join public.curricula c on c.id = cu.curriculum_id
  where cu.id = unit_id
    and (c.status = 'published' or c.created_by = auth.uid() or public.has_role('inspector') or public.is_super_admin())
));
create policy "learning_objectives_manage"
on public.learning_objectives for all
to authenticated using (public.has_role('inspector') or public.is_super_admin())
with check (public.has_role('inspector') or public.is_super_admin());

create policy "weekly_progressions_read"
on public.weekly_progressions for select
to authenticated
using (exists (
  select 1 from public.curricula c
  where c.id = curriculum_id
    and (c.status = 'published' or c.created_by = auth.uid() or public.has_role('inspector') or public.is_super_admin())
));
create policy "weekly_progressions_manage"
on public.weekly_progressions for all
to authenticated using (public.has_role('inspector') or public.is_super_admin())
with check (public.has_role('inspector') or public.is_super_admin());

-- =========================================================
-- 8. FICHES PEDAGOGIQUES ET RESSOURCES DU MVP
-- =========================================================
create policy "lesson_plans_owner_read"
on public.lesson_plans for select
to authenticated
using (teacher_id = auth.uid() or status = 'published' or public.is_super_admin());

create policy "lesson_plans_owner_insert"
on public.lesson_plans for insert
to authenticated
with check (teacher_id = auth.uid() and public.has_role('teacher'));

create policy "lesson_plans_owner_update"
on public.lesson_plans for update
to authenticated
using (teacher_id = auth.uid() or public.is_super_admin())
with check (teacher_id = auth.uid() or public.is_super_admin());

create policy "lesson_plans_owner_delete"
on public.lesson_plans for delete
to authenticated
using (teacher_id = auth.uid() or public.is_super_admin());

create policy "lesson_steps_read"
on public.lesson_steps for select
to authenticated
using (exists (
  select 1 from public.lesson_plans lp
  where lp.id = lesson_plan_id
    and (lp.teacher_id = auth.uid() or lp.status = 'published' or public.is_super_admin())
));

create policy "lesson_steps_owner_manage"
on public.lesson_steps for all
to authenticated
using (exists (
  select 1 from public.lesson_plans lp
  where lp.id = lesson_plan_id
    and (lp.teacher_id = auth.uid() or public.is_super_admin())
))
with check (exists (
  select 1 from public.lesson_plans lp
  where lp.id = lesson_plan_id
    and (lp.teacher_id = auth.uid() or public.is_super_admin())
));

create policy "resources_read"
on public.resources for select
to authenticated
using (owner_id = auth.uid() or is_public = true or status = 'published' or public.is_super_admin());

create policy "resources_owner_insert"
on public.resources for insert
to authenticated
with check (owner_id = auth.uid());

create policy "resources_owner_update"
on public.resources for update
to authenticated
using (owner_id = auth.uid() or public.is_super_admin())
with check (owner_id = auth.uid() or public.is_super_admin());

create policy "resources_owner_delete"
on public.resources for delete
to authenticated
using (owner_id = auth.uid() or public.is_super_admin());

create policy "lesson_resources_read"
on public.lesson_resources for select
to authenticated
using (exists (
  select 1 from public.lesson_plans lp
  where lp.id = lesson_plan_id
    and (lp.teacher_id = auth.uid() or lp.status = 'published' or public.is_super_admin())
));

create policy "lesson_resources_owner_manage"
on public.lesson_resources for all
to authenticated
using (exists (
  select 1 from public.lesson_plans lp
  where lp.id = lesson_plan_id
    and (lp.teacher_id = auth.uid() or public.is_super_admin())
))
with check (exists (
  select 1 from public.lesson_plans lp
  where lp.id = lesson_plan_id
    and (lp.teacher_id = auth.uid() or public.is_super_admin())
));

-- =========================================================
-- 9. COMPTE PERSONNEL : IA, NOTIFICATIONS, ABONNEMENTS
-- =========================================================
create policy "ai_generations_owner_all"
on public.ai_generations for all
to authenticated
using (user_id = auth.uid() or public.is_super_admin())
with check (user_id = auth.uid() or public.is_super_admin());

create policy "notifications_owner_read"
on public.notifications for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "notifications_owner_update"
on public.notifications for update
to authenticated
using (user_id = auth.uid() or public.is_super_admin())
with check (user_id = auth.uid() or public.is_super_admin());

create policy "subscriptions_owner_read"
on public.subscriptions for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "payments_owner_read"
on public.payments for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

-- =========================================================
-- 10. ADMINISTRATION GENERALE DU MVP
-- Les autres tables restent fermées aux utilisateurs ordinaires
-- tant que leurs interfaces ne sont pas développées.
-- =========================================================
create policy "schools_member_read"
on public.schools for select
to authenticated
using (public.belongs_to_school(id) or public.is_super_admin());
create policy "schools_admin_manage"
on public.schools for all
to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy "memberships_own_read"
on public.school_memberships for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "audit_admin_read"
on public.audit_logs for select
to authenticated using (public.is_super_admin());

-- =========================================================
-- 11. DROITS SUR LES FONCTIONS
-- =========================================================
revoke all on function public.handle_new_user() from public;
grant execute on function public.has_role(public.user_role) to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.belongs_to_school(uuid) to authenticated;
