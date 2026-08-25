-- Gabon Éduc+ — Les paliers à côté des trimestres
--
-- Deux découpages coexistent au primaire, et aucun ne remplace l'autre.
-- Beaucoup d'établissements s'en tiennent aux trois trimestres. D'autres
-- évaluent par paliers — deux par trimestre, soit six paliers, plus un bilan
-- de fin d'année ; le bulletin qui a servi de modèle porte la mention
-- « BULLETIN D'ÉVALUATION DU PALIER 3 ».
--
-- Le palier ne remplace pas le trimestre : il se loge dedans. D'où la colonne
-- de rattachement — un bulletin trimestriel pourra agréger ses deux paliers
-- sans qu'une note soit ressaisie.

-- Les contraintes de vérification sur « period_kind » ont été posées sans nom
-- explicite dans les migrations 009 et 014 : PostgreSQL leur en a donné un que
-- l'on ne peut pas deviner à coup sûr. On les retrouve par leur définition
-- plutôt que par leur nom, faute de quoi cette migration passerait sur une
-- base et échouerait sur une autre.
do $$
declare
  contrainte record;
begin
  for contrainte in
    select conname, conrelid::regclass::text as relation
      from pg_constraint
     where conrelid in (
             'public.school_periods'::regclass,
             'public.grading_periods'::regclass
           )
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%period_kind%'
  loop
    execute format(
      'alter table %s drop constraint %I',
      contrainte.relation, contrainte.conname
    );
  end loop;
end
$$;

alter table public.school_periods
  add constraint school_periods_period_kind_check
  check (period_kind in ('trimester', 'semester', 'palier', 'annual'));

alter table public.grading_periods
  add constraint grading_periods_period_kind_check
  check (period_kind in ('trimester', 'semester', 'palier', 'annual'));

-- Rattachement d'un palier à son trimestre.
--
-- « on delete set null » plutôt que « cascade » : supprimer un trimestre par
-- mégarde ne doit pas emporter les notes des deux paliers qu'il contenait.
-- Le palier devient orphelin, ce qui se voit et se répare ; des notes
-- disparues ne se réparent pas.
alter table public.school_periods
  add column if not exists parent_period_id uuid
  references public.school_periods(id) on delete set null;

-- Rang du palier dans l'année, de 1 à 6. Il court sur l'année entière et ne
-- repart pas à 1 à chaque trimestre : « palier 3 » doit désigner la même
-- période d'un établissement à l'autre.
alter table public.school_periods
  add column if not exists sequence_number integer;

create index if not exists idx_school_periods_parent
  on public.school_periods(parent_period_id);

-- Le découpage choisi par l'établissement.
create table if not exists public.school_report_settings(
  school_id uuid primary key references public.schools(id) on delete cascade,
  period_scheme text not null default 'trimester'
    check (period_scheme in ('trimester', 'palier')),
  paliers_per_term integer not null default 2
    check (paliers_per_term between 1 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.school_report_settings enable row level security;

-- Tout membre de l'établissement lit le réglage : l'enseignant en a besoin
-- pour savoir sur quelle période il saisit. Seules la direction et le
-- secrétariat le changent — basculer de trimestres en paliers en cours
-- d'année redécoupe toute l'évaluation.
drop policy if exists school_report_settings_read on public.school_report_settings;
create policy school_report_settings_read on public.school_report_settings
  for select to authenticated
  using (public.belongs_to_school(school_id));

drop policy if exists school_report_settings_write on public.school_report_settings;
create policy school_report_settings_write on public.school_report_settings
  for all to authenticated
  using (public.has_school_role(
    school_id, array['school_admin','headmaster','secretary','academic_director']
  ))
  with check (public.has_school_role(
    school_id, array['school_admin','headmaster','secretary','academic_director']
  ));

drop trigger if exists trg_school_report_settings_updated_at on public.school_report_settings;
create trigger trg_school_report_settings_updated_at
  before update on public.school_report_settings
  for each row execute function public.set_updated_at();

grant select, insert, update on public.school_report_settings to authenticated;

notify pgrst, 'reload schema';
