-- Gabon Éduc+ — Les notes se posent sur les lignes du bulletin
--
-- Le cahier de notes actuel travaille sur des matières saisies au clavier :
-- deux enseignants écrivent « Maths » et « Mathématiques », et le bulletin ne
-- sait plus qu'il s'agit de la même chose. Surtout, rien ne relie une note à
-- une ligne du bulletin ni à son barème, si bien qu'aucun calcul conforme
-- n'était possible.
--
-- Cette table pose la note là où elle appartient : sur une ligne du modèle,
-- pour un élève, dans une période. Trois références, et le bulletin se calcule
-- tout seul.
--
-- L'existant n'est pas touché. Les évaluations et le relevé de notes remis aux
-- familles continuent de fonctionner comme avant : cette étape s'ajoute, elle
-- ne remplace pas encore. Basculer les deux d'un coup aurait privé les parents
-- des notes au moment même où le bulletin devenait conforme.

create table if not exists public.report_line_scores(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.student_records(id) on delete cascade,
  period_id uuid not null references public.school_periods(id) on delete cascade,
  line_id uuid not null references public.report_model_lines(id) on delete cascade,
  -- Nullable, et c'est le point le plus important de cette table : une ligne
  -- non évaluée n'est pas une note de zéro. Un enfant absent à la dictée doit
  -- sortir du calcul, pas s'y effondrer. La distinction se perdrait si l'on
  -- écrivait 0 par défaut.
  score numeric(5,2),
  entered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, period_id, line_id)
);

create index if not exists idx_report_line_scores_lookup
  on public.report_line_scores(period_id, student_id);
create index if not exists idx_report_line_scores_line
  on public.report_line_scores(line_id);

-- Une note hors barème imprimerait « 15,00 /10 » sur un document officiel.
-- La vérification ne peut pas tenir dans une contrainte CHECK : le barème vit
-- dans une autre table. D'où ce déclencheur, qui refuse l'écriture plutôt que
-- de la corriger en silence — corriger sans le dire ferait douter l'enseignant
-- de ce qu'il a saisi.
create or replace function public.check_report_line_score()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  bareme numeric;
begin
  if new.score is null then return new; end if;
  select max_score into bareme from public.report_model_lines where id = new.line_id;
  if bareme is null then
    raise exception 'Cette ligne de bulletin n''existe plus.';
  end if;
  if new.score < 0 or new.score > bareme then
    raise exception 'La note % est hors barème : cette ligne est notée sur %.',
      new.score, bareme;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_report_line_scores_bareme on public.report_line_scores;
create trigger trg_report_line_scores_bareme
  before insert or update on public.report_line_scores
  for each row execute function public.check_report_line_score();

drop trigger if exists trg_report_line_scores_updated_at on public.report_line_scores;
create trigger trg_report_line_scores_updated_at
  before update on public.report_line_scores
  for each row execute function public.set_updated_at();

alter table public.report_line_scores enable row level security;

-- Lecture : l'enseignant de la classe, l'élève lui-même, et sa famille.
--
-- La famille lit sans attendre de publication, comme pour le relevé de notes :
-- « un parent doit être au courant de l'évolution des notes de son enfant dès
-- la première évaluation ». C'est le bulletin qui attend d'être publié, pas la
-- note.
drop policy if exists report_line_scores_read on public.report_line_scores;
create policy report_line_scores_read on public.report_line_scores
  for select to authenticated
  using (
    public.can_view_student(student_id)
    or public.is_family_of(student_id)
    or public.has_school_role(
         school_id,
         array['school_admin','headmaster','secretary','academic_director']
       )
  );

-- Écriture : l'enseignant qui a la classe, et la direction.
drop policy if exists report_line_scores_write on public.report_line_scores;
create policy report_line_scores_write on public.report_line_scores
  for all to authenticated
  using (
    public.has_school_role(
      school_id, array['school_admin','headmaster','academic_director']
    )
    or exists(
      select 1 from public.student_records sr
      where sr.id = student_id
        and public.can_manage_class(sr.school_id, sr.class_group_id)
    )
  )
  with check (
    public.has_school_role(
      school_id, array['school_admin','headmaster','academic_director']
    )
    or exists(
      select 1 from public.student_records sr
      where sr.id = student_id
        and public.can_manage_class(sr.school_id, sr.class_group_id)
    )
  );

grant select, insert, update, delete on public.report_line_scores to authenticated;

notify pgrst, 'reload schema';
