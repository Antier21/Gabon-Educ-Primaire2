-- Gabon Éduc+ — Les corrections de coordonnées deviennent des demandes
--
-- La migration 077 laissait le responsable écrire directement dans sa fiche.
-- Deux défauts sont apparus à l'usage, et le second est grave.
--
--   1. L'établissement n'était averti de rien. La correction arrivait en base
--      sans que personne ne la voie passer.
--
--   2. Surtout, le personnel ne lit jamais la table des responsables depuis
--      Supabase : sa liste vient de l'espace de travail du navigateur, qui est
--      poussé vers le nuage, jamais rapatrié. La prochaine sauvegarde du
--      secrétariat aurait donc réécrit l'ancien numéro par-dessus la
--      correction du parent, sans conflit ni message.
--
-- On sépare donc les deux gestes. Le parent dépose une demande ; c'est
-- l'établissement qui met la fiche à jour, par le chemin habituel. La fiche
-- officielle n'a ainsi qu'un seul auteur, et l'écrasement devient impossible.

drop function if exists public.update_my_guardian_contact(text, text, text);

create table if not exists public.guardian_contact_requests(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  phone text not null,
  email text,
  address text,
  -- Les valeurs d'avant sont conservées avec la demande : au moment de
  -- valider, le secrétariat doit voir ce qui change, pas seulement le nouveau
  -- numéro. Un chiffre inversé ne se repère que par comparaison.
  previous_phone text not null default '',
  previous_email text,
  previous_address text,
  status text not null default 'pending' check(status in ('pending','applied','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Une seule demande en attente par responsable : un parent qui se reprend
-- deux fois de suite ne doit pas remplir la file du secrétariat de versions
-- successives dont seule la dernière compte.
create unique index if not exists idx_guardian_contact_requests_pending
  on public.guardian_contact_requests(guardian_id)
  where status = 'pending';

create index if not exists idx_guardian_contact_requests_school
  on public.guardian_contact_requests(school_id, status, created_at desc);

alter table public.guardian_contact_requests enable row level security;

-- Le responsable relit sa propre demande — c'est ce qui lui permet de savoir
-- qu'elle est en attente plutôt que de la redéposer chaque semaine.
drop policy if exists gcr_family_read on public.guardian_contact_requests;
create policy gcr_family_read on public.guardian_contact_requests
  for select to authenticated
  using (exists(
    select 1 from public.guardians g
    where g.id = guardian_id and g.profile_id = auth.uid()
  ));

drop policy if exists gcr_staff_read on public.guardian_contact_requests;
create policy gcr_staff_read on public.guardian_contact_requests
  for select to authenticated
  using (public.has_school_role(
    school_id,
    array['school_admin','headmaster','secretary','academic_director']
  ));

-- Le personnel ne fait que trancher : il passe la demande à « appliquée » ou
-- « refusée ». La mise à jour de la fiche elle-même emprunte le chemin
-- ordinaire du module Parents, avec ses contrôles d'abonnement et de droits.
drop policy if exists gcr_staff_decide on public.guardian_contact_requests;
create policy gcr_staff_decide on public.guardian_contact_requests
  for update to authenticated
  using (public.has_school_role(
    school_id,
    array['school_admin','headmaster','secretary','academic_director']
  ))
  with check (public.has_school_role(
    school_id,
    array['school_admin','headmaster','secretary','academic_director']
  ));

-- Aucune politique d'insertion : seule la fonction ci-dessous dépose une
-- demande. Un parent ne peut donc ni choisir l'établissement visé, ni déposer
-- une demande au nom d'un autre responsable.
create or replace function public.request_my_contact_change(
  new_phone text,
  new_email text,
  new_address text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_phone text;
  cleaned_email text;
  cleaned_address text;
  touched integer := 0;
  fiche record;
begin
  cleaned_phone := regexp_replace(coalesce(new_phone, ''), '[^0-9+]', '', 'g');
  if length(regexp_replace(cleaned_phone, '[^0-9]', '', 'g')) < 8 then
    raise exception 'Le numéro de téléphone doit comporter au moins 8 chiffres.';
  end if;

  cleaned_email := nullif(btrim(coalesce(new_email, '')), '');
  if cleaned_email is not null
     and cleaned_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'L''adresse électronique saisie n''est pas valide.';
  end if;

  cleaned_address := nullif(btrim(coalesce(new_address, '')), '');

  -- Un même parent peut avoir une fiche dans deux établissements : deux
  -- enfants, deux écoles. Son numéro est le même partout, mais chaque
  -- établissement valide pour lui-même.
  for fiche in
    select id, school_id, phone, email, address
      from public.guardians
     where profile_id = auth.uid() and status = 'active'
  loop
    delete from public.guardian_contact_requests
     where guardian_id = fiche.id and status = 'pending';

    insert into public.guardian_contact_requests(
      school_id, guardian_id, requested_by,
      phone, email, address,
      previous_phone, previous_email, previous_address
    ) values (
      fiche.school_id, fiche.id, auth.uid(),
      cleaned_phone, cleaned_email, cleaned_address,
      fiche.phone, fiche.email, fiche.address
    );

    touched := touched + 1;
  end loop;

  if touched = 0 then
    raise exception 'Aucune fiche de responsable active n''est rattachée à ce compte.';
  end if;

  return touched;
end;
$$;

revoke all on function public.request_my_contact_change(text, text, text) from public;
grant execute on function public.request_my_contact_change(text, text, text) to authenticated;
grant select, update on public.guardian_contact_requests to authenticated;

drop trigger if exists trg_guardian_contact_requests_updated_at on public.guardian_contact_requests;
create trigger trg_guardian_contact_requests_updated_at
  before update on public.guardian_contact_requests
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
