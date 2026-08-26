-- Gabon Éduc+ — La publication du bulletin aux familles
--
-- Deux choses distinctes, et l'établissement y tient :
--
--   — le relevé de notes arrive à la famille dès la première évaluation, sans
--     attendre quoi que ce soit. C'est déjà le cas.
--   — le bulletin, lui, n'apparaît qu'une fois publié. C'est un acte de
--     l'établissement, pas une conséquence de la saisie.
--
-- La publication porte sur une classe et une période entières, jamais sur un
-- élève isolé : remettre son bulletin à un enfant et pas à son voisin ne se
-- fait pas, et laisser ce choix ouvert reviendrait à l'autoriser.

create table if not exists public.report_publications(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_group_id uuid not null references public.class_groups(id) on delete cascade,
  period_id uuid not null references public.school_periods(id) on delete cascade,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_group_id, period_id)
);

create index if not exists idx_report_publications_lookup
  on public.report_publications(period_id, class_group_id);

alter table public.report_publications enable row level security;

-- La famille lit la publication de la classe de son enfant : c'est elle qui
-- décide si le bulletin s'affiche ou reste caché. Le personnel de
-- l'établissement la lit aussi, pour savoir ce qui est déjà sorti.
drop policy if exists report_publications_read on public.report_publications;
create policy report_publications_read on public.report_publications
  for select to authenticated
  using (
    public.belongs_to_school(school_id)
    or exists(
      select 1 from public.student_records sr
      where sr.class_group_id = report_publications.class_group_id
        and public.is_family_of(sr.id)
    )
  );

-- Publier et dépublier restent à la direction.
--
-- « Seul le responsable et celui à qui il aura confié le rôle sont habilités à
-- publier les bulletins » : l'enseignant saisit et imprime, il ne décide pas
-- de la remise aux familles.
drop policy if exists report_publications_write on public.report_publications;
create policy report_publications_write on public.report_publications
  for all to authenticated
  using (public.has_school_role(
    school_id, array['school_admin','headmaster','academic_director']
  ))
  with check (public.has_school_role(
    school_id, array['school_admin','headmaster','academic_director']
  ));

drop trigger if exists trg_report_publications_updated_at on public.report_publications;
create trigger trg_report_publications_updated_at
  before update on public.report_publications
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.report_publications to authenticated;

-- La famille doit pouvoir lire la classe de son enfant pour rapprocher un
-- bulletin publié de l'élève concerné. La lecture se limite au nom du groupe.
drop policy if exists class_groups_family_read on public.class_groups;
create policy class_groups_family_read on public.class_groups
  for select to authenticated
  using (exists(
    select 1 from public.student_records sr
    where sr.class_group_id = class_groups.id
      and public.is_family_of(sr.id)
  ));

notify pgrst, 'reload schema';
