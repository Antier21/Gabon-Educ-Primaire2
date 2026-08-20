-- Gabon Éduc+ — Schéma initial de base de données
-- Cible : PostgreSQL 15+ / Supabase
-- Version : 1.0

create extension if not exists pgcrypto;

-- =========================================================
-- 1. TYPES ENUMERES
-- =========================================================
create type user_role as enum (
  'super_admin',
  'inspector',
  'school_admin',
  'teacher',
  'student',
  'parent'
);

create type content_status as enum ('draft', 'pending_review', 'published', 'archived');
create type membership_status as enum ('pending', 'active', 'suspended', 'ended');
create type subscription_status as enum (
  'trial',
  'active',
  'past_due',
  'grace_period',
  'suspended',
  'cancelled',
  'expired'
);create type question_type as enum ('mcq', 'true_false', 'short_answer', 'long_answer', 'numeric', 'matching');
create type resource_type as enum ('text', 'pdf', 'image', 'video', 'audio', 'link', 'interactive');
create type submission_status as enum ('not_started', 'in_progress', 'submitted', 'graded', 'returned');

-- =========================================================
-- 2. UTILISATEURS ET PROFILS
-- =========================================================
-- Dans Supabase, auth.users est géré par Supabase Auth.
-- Cette table contient le profil applicatif.
create table profiles (
  id uuid primary key,
  first_name text not null,
  last_name text not null,
  display_name text,
  phone text,
  avatar_url text,
  date_of_birth date,
  country_code char(2) default 'GA',
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role user_role not null,
  scope_school_id uuid,
  created_at timestamptz not null default now(),
  unique(user_id, role, scope_school_id)
);

-- =========================================================
-- 3. ETABLISSEMENTS ET ORGANISATION
-- =========================================================
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  school_type text,
  registration_number text,
  province text,
  city text,
  district text,
  address text,
  phone text,
  email text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_roles
  add constraint fk_user_roles_scope_school
  foreign key (scope_school_id) references schools(id) on delete cascade;

create table school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role user_role not null,
  status membership_status not null default 'active',
  joined_at date not null default current_date,
  ended_at date,
  created_at timestamptz not null default now(),
  unique(school_id, user_id, role)
);

-- =========================================================
-- 4. ANNEES, CLASSES, MATIERES ET GROUPES
-- =========================================================
create table academic_years (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  check (ends_on > starts_on)
);

create table grade_levels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  cycle text not null,
  sort_order integer not null,
  is_active boolean not null default true
);

create table subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table class_groups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id),
  grade_level_id uuid not null references grade_levels(id),
  name text not null,
  room text,
  homeroom_teacher_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique(school_id, academic_year_id, name)
);

create table class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_group_id uuid not null references class_groups(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  status membership_status not null default 'active',
  enrolled_at date not null default current_date,
  ended_at date,
  unique(class_group_id, student_id)
);

create table teaching_assignments (
  id uuid primary key default gen_random_uuid(),
  class_group_id uuid not null references class_groups(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  teacher_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(class_group_id, subject_id, teacher_id)
);

create table parent_student_links (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references profiles(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  relationship text not null default 'parent',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(parent_id, student_id)
);

-- =========================================================
-- 5. PROGRAMMES ET PROGRESSIONS OFFICIELLES
-- =========================================================
create table curricula (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null default 'GA',
  academic_year_id uuid references academic_years(id),
  subject_id uuid not null references subjects(id),
  grade_level_id uuid not null references grade_levels(id),
  title text not null,
  version text,
  source_url text,
  status content_status not null default 'draft',
  validated_by uuid references profiles(id),
  validated_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(country_code, academic_year_id, subject_id, grade_level_id, version)
);

create table curriculum_units (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references curricula(id) on delete cascade,
  title text not null,
  description text,
  position integer not null,
  estimated_hours numeric(6,2),
  created_at timestamptz not null default now(),
  unique(curriculum_id, position)
);

create table competencies (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references curricula(id) on delete cascade,
  code text,
  title text not null,
  description text,
  competency_type text,
  created_at timestamptz not null default now()
);

create table learning_objectives (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references curriculum_units(id) on delete cascade,
  competency_id uuid references competencies(id) on delete set null,
  title text not null,
  description text,
  position integer not null,
  unique(unit_id, position)
);

create table weekly_progressions (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references curricula(id) on delete cascade,
  week_number integer not null check (week_number between 1 and 53),
  unit_id uuid references curriculum_units(id) on delete set null,
  objective_id uuid references learning_objectives(id) on delete set null,
  suggested_topic text,
  suggested_hours numeric(5,2),
  notes text,
  unique(curriculum_id, week_number, objective_id)
);

-- =========================================================
-- 6. PREPARATION PEDAGOGIQUE ET CONTENUS
-- =========================================================
create table lesson_plans (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  school_id uuid references schools(id) on delete set null,
  class_group_id uuid references class_groups(id) on delete set null,
  subject_id uuid not null references subjects(id),
  grade_level_id uuid not null references grade_levels(id),
  curriculum_id uuid references curricula(id) on delete set null,
  objective_id uuid references learning_objectives(id) on delete set null,
  title text not null,
  week_number integer check (week_number between 1 and 53),
  duration_minutes integer check (duration_minutes > 0),
  prerequisite text,
  situation_problem text,
  teacher_actions text,
  student_actions text,
  lesson_summary text,
  differentiation text,
  homework text,
  status content_status not null default 'draft',
  is_ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lesson_steps (
  id uuid primary key default gen_random_uuid(),
  lesson_plan_id uuid not null references lesson_plans(id) on delete cascade,
  title text not null,
  description text,
  teacher_instructions text,
  student_instructions text,
  duration_minutes integer,
  position integer not null,
  unique(lesson_plan_id, position)
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  subject_id uuid references subjects(id),
  grade_level_id uuid references grade_levels(id),
  title text not null,
  description text,
  resource_type resource_type not null,
  storage_path text,
  external_url text,
  mime_type text,
  status content_status not null default 'draft',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lesson_resources (
  lesson_plan_id uuid not null references lesson_plans(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  position integer not null default 1,
  primary key(lesson_plan_id, resource_id)
);

-- =========================================================
-- 7. EXERCICES, QUESTIONS ET EVALUATIONS
-- =========================================================
create table question_banks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  grade_level_id uuid not null references grade_levels(id),
  title text not null,
  description text,
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid references question_banks(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  grade_level_id uuid not null references grade_levels(id),
  objective_id uuid references learning_objectives(id) on delete set null,
  author_id uuid references profiles(id) on delete set null,
  question_type question_type not null,
  prompt text not null,
  explanation text,
  points numeric(6,2) not null default 1,
  difficulty smallint check (difficulty between 1 and 5),
  correct_answer jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status content_status not null default 'draft',
  is_ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  position integer not null,
  unique(question_id, position)
);

create table assessments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  class_group_id uuid references class_groups(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  grade_level_id uuid not null references grade_levels(id),
  title text not null,
  instructions text,
  assessment_type text,
  duration_minutes integer,
  total_points numeric(8,2),
  opens_at timestamptz,
  closes_at timestamptz,
  status content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table assessment_questions (
  assessment_id uuid not null references assessments(id) on delete cascade,
  question_id uuid not null references questions(id) on delete restrict,
  position integer not null,
  points_override numeric(6,2),
  primary key(assessment_id, question_id),
  unique(assessment_id, position)
);

create table assessment_submissions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  status submission_status not null default 'not_started',
  started_at timestamptz,
  submitted_at timestamptz,
  graded_at timestamptz,
  graded_by uuid references profiles(id),
  score numeric(8,2),
  teacher_feedback text,
  unique(assessment_id, student_id)
);

create table submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references assessment_submissions(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  answer jsonb,
  score numeric(6,2),
  feedback text,
  is_correct boolean,
  unique(submission_id, question_id)
);

-- =========================================================
-- 8. ABONNEMENTS ET PAIEMENTS
-- =========================================================
create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  audience user_role,
  price_fcfa integer not null default 0 check (price_fcfa >= 0),
  billing_period text not null default 'monthly',
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  school_id uuid references schools(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status subscription_status not null default 'trial',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  auto_renew boolean not null default false,
  provider text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  check (user_id is not null or school_id is not null)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  school_id uuid references schools(id) on delete set null,
  amount_fcfa integer not null check (amount_fcfa >= 0),
  payment_method text,
  provider text,
  provider_reference text,
  status text not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 9. IA, NOTIFICATIONS ET AUDIT
-- =========================================================
create table ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  feature text not null,
  subject_id uuid references subjects(id),
  grade_level_id uuid references grade_levels(id),
  prompt text not null,
  output jsonb,
  model_name text,
  tokens_used integer,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text not null,
  channel text not null default 'in_app',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id bigserial primary key,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 10. INDEXES
-- =========================================================
create index idx_profiles_name on profiles(last_name, first_name);
create index idx_memberships_school on school_memberships(school_id, status);
create index idx_class_enrollments_student on class_enrollments(student_id);
create index idx_teaching_assignments_teacher on teaching_assignments(teacher_id);
create index idx_curricula_lookup on curricula(subject_id, grade_level_id, academic_year_id, status);
create index idx_weekly_progressions_week on weekly_progressions(curriculum_id, week_number);
create index idx_lesson_plans_teacher on lesson_plans(teacher_id, subject_id, grade_level_id, status);
create index idx_questions_lookup on questions(subject_id, grade_level_id, difficulty, status);
create index idx_assessments_class on assessments(class_group_id, subject_id, status);
create index idx_submissions_student on assessment_submissions(student_id, status);
create index idx_notifications_user on notifications(user_id, read_at);
create index idx_ai_generations_user on ai_generations(user_id, created_at desc);

-- =========================================================
-- 11. MISE A JOUR AUTOMATIQUE DE updated_at
-- =========================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
before update on profiles
for each row execute function set_updated_at();

create trigger trg_schools_updated_at
before update on schools
for each row execute function set_updated_at();

create trigger trg_curricula_updated_at
before update on curricula
for each row execute function set_updated_at();

create trigger trg_lesson_plans_updated_at
before update on lesson_plans
for each row execute function set_updated_at();

create trigger trg_resources_updated_at
before update on resources
for each row execute function set_updated_at();

create trigger trg_questions_updated_at
before update on questions
for each row execute function set_updated_at();

create trigger trg_assessments_updated_at
before update on assessments
for each row execute function set_updated_at();

-- =========================================================
-- 12. DONNEES INITIALES
-- =========================================================
insert into grade_levels (code, name, cycle, sort_order) values
('6E', 'Sixième', 'Collège', 1),
('5E', 'Cinquième', 'Collège', 2),
('4E', 'Quatrième', 'Collège', 3),
('3E', 'Troisième', 'Collège', 4),
('2NDE', 'Seconde', 'Lycée', 5),
('1ERE', 'Première', 'Lycée', 6),
('TLE', 'Terminale', 'Lycée', 7)
on conflict do nothing;

insert into subjects (code, name, description) values
('FRA', 'Français', 'Langue, littérature et expression'),
('MAT', 'Mathématiques', 'Nombres, algèbre, géométrie et statistiques'),
('PHY', 'Physique-Chimie', 'Sciences physiques et chimiques'),
('SVT', 'Sciences de la Vie et de la Terre', 'Biologie, santé et environnement'),
('HIS', 'Histoire', 'Étude des sociétés dans le temps'),
('GEO', 'Géographie', 'Étude des territoires et des sociétés'),
('ANG', 'Anglais', 'Langue anglaise'),
('ESP', 'Espagnol', 'Langue espagnole'),
('PHI', 'Philosophie', 'Réflexion philosophique et argumentation')
on conflict do nothing;

insert into plans (code, name, audience, price_fcfa, billing_period, features) values
('FREE_TEACHER', 'Enseignant Découverte', 'teacher', 0, 'monthly', '{"lesson_plans_per_month": 3, "ai_generations_per_month": 5}'),
('PRO_TEACHER', 'Enseignant Pro', 'teacher', 5000, 'monthly', '{"lesson_plans_per_month": -1, "ai_generations_per_month": 100, "pdf_export": true}'),
('SCHOOL', 'Établissement', 'school_admin', 50000, 'monthly', '{"teacher_accounts": 50, "analytics": true, "admin_dashboard": true}')
on conflict do nothing;

-- =========================================================
-- 13. REMARQUES SUPABASE
-- =========================================================
-- 1) Relier profiles.id à auth.users.id.
-- 2) Activer Row Level Security avant la mise en production.
-- 3) Créer des politiques RLS par rôle et établissement.
-- 4) Stocker les fichiers dans Supabase Storage et garder seulement leur chemin ici.
