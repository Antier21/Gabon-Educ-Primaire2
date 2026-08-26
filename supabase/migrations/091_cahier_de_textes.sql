-- Gabon Éduc+ — Le cahier de textes
--
-- Une trace, et non une préparation. La distinction n'est pas de vocabulaire :
-- elle décide de tout le reste.
--
-- La fiche pédagogique (« lesson_plans ») s'écrit AVANT le cours. Elle est
-- l'outil de l'enseignant, elle peut rester à l'état de brouillon, être
-- refaite, abandonnée. Le cahier de textes s'écrit APRÈS, il dit ce qui a
-- effectivement eu lieu ce jour-là dans cette classe, et il fait foi — c'est
-- le document qu'un inspecteur ouvre, et celui sur lequel une famille
-- s'appuie quand son enfant a manqué la séance.
--
-- Confondre les deux aurait conduit à publier des brouillons aux familles, ou
-- à interdire à l'enseignant de raturer sa propre préparation. Ce sont donc
-- deux tables, et la fiche peut être RATTACHÉE à la séance — l'enseignant
-- l'offre alors en pièce jointe, sans qu'aucun fichier ne soit téléversé
-- puisqu'elle vit déjà en base.
--
-- L'ancrage sur la séance, ensuite. Un créneau d'emploi du temps
-- (« timetable_slots ») est un modèle hebdomadaire : « le mercredi de 9h30 à
-- 10h30 ». Une séance est une occurrence datée de ce modèle. On garde donc la
-- date pleine, l'horaire, et un lien facultatif vers le créneau : un
-- établissement dont l'emploi du temps n'est pas encore saisi doit pouvoir
-- tenir son cahier de textes malgré tout.

create table if not exists public.lesson_book_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  class_group_id uuid not null references public.class_groups(id) on delete cascade,
  school_subject_id uuid references public.school_subjects(id) on delete set null,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  -- Facultatif : la séance existe même sans emploi du temps saisi.
  timetable_slot_id uuid references public.timetable_slots(id) on delete set null,

  session_date date not null,
  starts_at time,
  ends_at time,

  title text not null default '',
  /*
   * Le contenu est du HTML restreint, produit par l'éditeur de l'application :
   * gras, italique, souligné, listes, sous-titres, couleur, liens. Il est
   * nettoyé à l'écriture ET à la lecture — un cahier de textes est relu par
   * des familles, et du HTML non filtré y serait une porte ouverte.
   */
  content_html text not null default '',
  program_elements text not null default '',
  category text not null default '',
  themes text[] not null default '{}',

  /*
   * Publication.
   *
   * Même règle que le bulletin : l'enseignant écrit, et décide quand la séance
   * devient visible aux familles. Une séance en cours de rédaction ne doit pas
   * atteindre les parents à moitié écrite.
   */
  is_published boolean not null default false,
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Une seule entrée par séance : le même cours ne se raconte pas deux fois.
  unique (class_group_id, school_subject_id, session_date, starts_at)
);

/*
 * Le travail à effectuer.
 *
 * Table séparée, parce qu'une séance peut n'en donner aucun, ou trois : une
 * lecture pour demain, un exercice pour la semaine prochaine, un exposé pour
 * le mois. Chacun porte sa propre échéance — c'est elle qui compte pour
 * l'élève, et elle ne coïncide pas avec la date de la séance.
 */
create table if not exists public.lesson_book_homework (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.lesson_book_entries(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  description_html text not null default '',
  due_date date,
  submission_mode text not null default 'papier'
    check (submission_mode in ('papier', 'oral', 'en ligne', 'aucun')),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/*
 * Les fiches rattachées à une séance.
 *
 * C'est la « pièce jointe » sans téléversement : la fiche existe déjà, on ne
 * fait que la désigner. Une table de liaison plutôt qu'une colonne, parce
 * qu'une séance peut s'appuyer sur plusieurs fiches, et qu'une fiche peut
 * servir à plusieurs séances — dans deux classes du même niveau, par exemple.
 */
create table if not exists public.lesson_book_attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.lesson_book_entries(id) on delete cascade,
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (entry_id, lesson_plan_id)
);

create index if not exists idx_lesson_book_class_date
  on public.lesson_book_entries(class_group_id, session_date desc);
create index if not exists idx_lesson_book_teacher_date
  on public.lesson_book_entries(teacher_id, session_date desc);
create index if not exists idx_lesson_book_school_year
  on public.lesson_book_entries(school_id, academic_year_id, session_date desc);
create index if not exists idx_lesson_book_homework_entry
  on public.lesson_book_homework(entry_id, position);

alter table public.lesson_book_entries enable row level security;
alter table public.lesson_book_homework enable row level security;
alter table public.lesson_book_attachments enable row level security;

-- ===================================================================
-- Qui lit, qui écrit
-- ===================================================================

/*
 * L'enseignant tient son propre cahier. La direction lit tout — c'est le
 * document de contrôle. La famille ne voit qu'une séance publiée, dans la
 * classe de son enfant.
 *
 * La vérification familiale passe par « is_family_of_class », fonction
 * « security definer » : une politique qui interrogerait « student_records »
 * directement porterait la forme qui a déjà produit une récursion infinie sur
 * les classes.
 */
drop policy if exists lesson_book_entries_read on public.lesson_book_entries;
create policy lesson_book_entries_read on public.lesson_book_entries
  for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.belongs_to_school(school_id)
    or (is_published and public.is_family_of_class(class_group_id))
  );

-- L'enseignant écrit ses séances, la direction peut corriger.
drop policy if exists lesson_book_entries_write on public.lesson_book_entries;
create policy lesson_book_entries_write on public.lesson_book_entries
  for all to authenticated
  using (
    teacher_id = auth.uid()
    or public.has_school_role(school_id, array['school_admin', 'headmaster', 'academic_director'])
  )
  with check (
    teacher_id = auth.uid()
    or public.has_school_role(school_id, array['school_admin', 'headmaster', 'academic_director'])
  );

/*
 * Le travail à effectuer suit sa séance.
 *
 * Sa politique passe par une fonction plutôt que par une sous-requête sur
 * « lesson_book_entries » : c'est la même précaution que ci-dessus, prise
 * cette fois avant l'accident plutôt qu'après.
 */
create or replace function public.can_read_lesson_entry(target_entry uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.lesson_book_entries e
    where e.id = target_entry
      and (
        e.teacher_id = auth.uid()
        or public.belongs_to_school(e.school_id)
        or (e.is_published and public.is_family_of_class(e.class_group_id))
      )
  );
$$;

create or replace function public.can_write_lesson_entry(target_entry uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.lesson_book_entries e
    where e.id = target_entry
      and (
        e.teacher_id = auth.uid()
        or public.has_school_role(
             e.school_id, array['school_admin', 'headmaster', 'academic_director'])
      )
  );
$$;

revoke all on function public.can_read_lesson_entry(uuid) from public;
grant execute on function public.can_read_lesson_entry(uuid) to authenticated;
revoke all on function public.can_write_lesson_entry(uuid) from public;
grant execute on function public.can_write_lesson_entry(uuid) to authenticated;

drop policy if exists lesson_book_homework_read on public.lesson_book_homework;
create policy lesson_book_homework_read on public.lesson_book_homework
  for select to authenticated
  using (public.can_read_lesson_entry(entry_id));

drop policy if exists lesson_book_homework_write on public.lesson_book_homework;
create policy lesson_book_homework_write on public.lesson_book_homework
  for all to authenticated
  using (public.can_write_lesson_entry(entry_id))
  with check (public.can_write_lesson_entry(entry_id));

drop policy if exists lesson_book_attachments_read on public.lesson_book_attachments;
create policy lesson_book_attachments_read on public.lesson_book_attachments
  for select to authenticated
  using (public.can_read_lesson_entry(entry_id));

drop policy if exists lesson_book_attachments_write on public.lesson_book_attachments;
create policy lesson_book_attachments_write on public.lesson_book_attachments
  for all to authenticated
  using (public.can_write_lesson_entry(entry_id))
  with check (public.can_write_lesson_entry(entry_id));

/*
 * La fiche rattachée doit être lisible par la famille.
 *
 * « lesson_plans » n'était ouvert qu'à son auteur et aux fiches publiées. Une
 * fiche rattachée à une séance publiée devient une pièce jointe du cahier de
 * textes : la famille doit pouvoir l'ouvrir, sans quoi le lien afficherait un
 * vide, ce qui est pire que pas de lien du tout.
 */
create or replace function public.is_attached_to_published_entry(target_plan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.lesson_book_attachments a
    join public.lesson_book_entries e on e.id = a.entry_id
    where a.lesson_plan_id = target_plan
      and e.is_published
      and public.is_family_of_class(e.class_group_id)
  );
$$;

revoke all on function public.is_attached_to_published_entry(uuid) from public;
grant execute on function public.is_attached_to_published_entry(uuid) to authenticated;

drop policy if exists lesson_plans_family_attachment_read on public.lesson_plans;
create policy lesson_plans_family_attachment_read on public.lesson_plans
  for select to authenticated
  using (public.is_attached_to_published_entry(id));

drop trigger if exists trg_lesson_book_entries_updated_at on public.lesson_book_entries;
create trigger trg_lesson_book_entries_updated_at before update on public.lesson_book_entries
for each row execute function public.set_updated_at();
drop trigger if exists trg_lesson_book_homework_updated_at on public.lesson_book_homework;
create trigger trg_lesson_book_homework_updated_at before update on public.lesson_book_homework
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
