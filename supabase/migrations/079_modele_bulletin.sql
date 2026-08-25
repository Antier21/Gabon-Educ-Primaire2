-- Gabon Éduc+ — Le modèle de bulletin de l'établissement
--
-- Le bulletin gabonais de primaire n'est pas une liste de matières : c'est une
-- structure à trois étages. Quatre domaines — Français, Anglais,
-- Mathématiques, Éveil — découpés en compétences (C1, C2, C3), elles-mêmes
-- découpées en lignes de notes portant chacune son barème. Dix-neuf lignes,
-- deux cents points.
--
-- L'application travaillait jusqu'ici sur des matières saisies au clavier,
-- sans compétences ni barèmes propres. Un bulletin construit là-dessus ne
-- pouvait pas ressembler à celui que l'établissement remet déjà — et un
-- bulletin qui ne ressemble pas au document attendu se remarque en trois
-- secondes.
--
-- Trois choses restent à l'établissement, et c'est pourquoi cette structure
-- vit en base plutôt qu'en dur dans le code :
--
--   — les matières : le privé enseigne les matières officielles et y ajoute
--     les siennes ;
--   — les barèmes : « Résolution de problèmes » sur 20 est le choix d'un
--     établissement, pas une règle nationale ;
--   — l'ordre d'apparition, qui suit la maquette du bulletin imprimé.

create table if not exists public.report_model_domains(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  label text not null,
  -- Le bulletin papier abrège : « Éveil » pour « Éveil (EDM / EAS) ». La
  -- colonne d'un tableau A4 ne supporte pas le libellé long.
  short_label text not null default '',
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_model_skills(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  domain_id uuid not null references public.report_model_domains(id) on delete cascade,
  -- « C1 », « C2 », « C3 » sur le modèle officiel, mais rien n'oblige un
  -- établissement à s'en tenir à ces trois codes.
  code text not null,
  label text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(domain_id, code)
);

create table if not exists public.report_model_lines(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  skill_id uuid not null references public.report_model_skills(id) on delete cascade,
  label text not null,
  -- Chaque ligne porte son propre barème : c'est lui qui pondère la moyenne,
  -- et c'est pourquoi une ligne sur 20 pèse deux fois une ligne sur 10.
  max_score numeric(5,2) not null default 10 check (max_score > 0),
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_report_model_domains_school
  on public.report_model_domains(school_id, position);
create index if not exists idx_report_model_skills_domain
  on public.report_model_skills(domain_id, position);
create index if not exists idx_report_model_lines_skill
  on public.report_model_lines(skill_id, position);

alter table public.report_model_domains enable row level security;
alter table public.report_model_skills enable row level security;
alter table public.report_model_lines enable row level security;

-- Lecture large, écriture étroite.
--
-- Tout membre de l'établissement lit le modèle : l'enseignant en a besoin pour
-- saisir ses notes sur les bonnes lignes, et la famille pour lire le bulletin.
-- Seuls la direction et le secrétariat le modifient — changer un barème en
-- cours d'année déplace toutes les moyennes déjà calculées.
do $$
declare
  nom text;
begin
  foreach nom in array array[
    'report_model_domains', 'report_model_skills', 'report_model_lines'
  ] loop
    execute format('drop policy if exists %I_read on public.%I', nom, nom);
    execute format(
      'create policy %I_read on public.%I for select to authenticated using (public.belongs_to_school(school_id))',
      nom, nom
    );
    execute format('drop policy if exists %I_write on public.%I', nom, nom);
    execute format(
      'create policy %I_write on public.%I for all to authenticated '
      'using (public.has_school_role(school_id, array[''school_admin'',''headmaster'',''secretary'',''academic_director''])) '
      'with check (public.has_school_role(school_id, array[''school_admin'',''headmaster'',''secretary'',''academic_director'']))',
      nom, nom
    );
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', nom, nom);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()',
      nom, nom
    );
  end loop;
end
$$;

-- La famille lit le modèle sans appartenir à l'établissement : sans cette
-- politique, le bulletin de l'espace parent afficherait des lignes sans nom.
drop policy if exists report_model_domains_family_read on public.report_model_domains;
create policy report_model_domains_family_read on public.report_model_domains
  for select to authenticated
  using (exists(
    select 1 from public.student_records sr
    where sr.school_id = report_model_domains.school_id
      and public.is_family_of(sr.id)
  ));

drop policy if exists report_model_skills_family_read on public.report_model_skills;
create policy report_model_skills_family_read on public.report_model_skills
  for select to authenticated
  using (exists(
    select 1 from public.student_records sr
    where sr.school_id = report_model_skills.school_id
      and public.is_family_of(sr.id)
  ));

drop policy if exists report_model_lines_family_read on public.report_model_lines;
create policy report_model_lines_family_read on public.report_model_lines
  for select to authenticated
  using (exists(
    select 1 from public.student_records sr
    where sr.school_id = report_model_lines.school_id
      and public.is_family_of(sr.id)
  ));

grant select, insert, update, delete on public.report_model_domains to authenticated;
grant select, insert, update, delete on public.report_model_skills to authenticated;
grant select, insert, update, delete on public.report_model_lines to authenticated;

notify pgrst, 'reload schema';
