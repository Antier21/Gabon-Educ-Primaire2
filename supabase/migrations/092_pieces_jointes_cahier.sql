-- Gabon Éduc+ — Les pièces jointes du cahier de textes
--
-- Le trombone doit ouvrir l'explorateur de fichiers. Cela suppose un espace de
-- stockage, que la plateforme n'avait pas : jusqu'ici, aucun fichier n'était
-- hébergé nulle part — ni photo d'élève, ni PDF, ni attestation.
--
-- Ce chantier ouvre donc le premier, et il servira au-delà du cahier de
-- textes.
--
-- ===================================================================
-- 1. Le seau
-- ===================================================================
--
-- Privé, et non public. Un seau public rend chaque fichier lisible par son
-- adresse, sans connexion : les devoirs d'une classe deviendraient
-- consultables par quiconque devine ou reçoit un lien. La lecture passera donc
-- par des adresses signées, valables quelques minutes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cahier-de-textes',
  'cahier-de-textes',
  false,
  -- 10 Mo. Assez pour un sujet scanné ; assez peu pour qu'un envoi reste
  -- possible sur une connexion d'établissement à Libreville.
  10485760,
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;

-- ===================================================================
-- 2. Le registre des fichiers
-- ===================================================================
--
-- Le seau garde les octets ; cette table garde ce qu'on en dit — le nom
-- d'origine, le poids, qui l'a déposé. Sans elle, l'écran afficherait des
-- chemins techniques au lieu de « Sujet de contrôle.pdf », et l'on ne saurait
-- pas retrouver les fichiers d'une séance sans parcourir tout le seau.

create table if not exists public.lesson_book_files (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.lesson_book_entries(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  -- Le chemin dans le seau : « <école>/<séance>/<identifiant>-<nom> ».
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lesson_book_files_entry
  on public.lesson_book_files(entry_id);

alter table public.lesson_book_files enable row level security;

-- Les mêmes règles que la séance à laquelle le fichier appartient : c'est elle
-- qui décide, et non le fichier. Une pièce jointe d'une séance publiée est
-- lisible par la famille ; celle d'un brouillon ne l'est pas.
drop policy if exists lesson_book_files_read on public.lesson_book_files;
create policy lesson_book_files_read on public.lesson_book_files
  for select to authenticated
  using (public.can_read_lesson_entry(entry_id));

drop policy if exists lesson_book_files_write on public.lesson_book_files;
create policy lesson_book_files_write on public.lesson_book_files
  for all to authenticated
  using (public.can_write_lesson_entry(entry_id))
  with check (public.can_write_lesson_entry(entry_id));

-- ===================================================================
-- 3. Les droits sur les octets eux-mêmes
-- ===================================================================
--
-- Protéger le registre ne suffit pas : sans politique sur le seau, un compte
-- connecté pourrait lire ou déposer n'importe quel fichier. Les droits sont
-- donc déduits du chemin — dont le deuxième dossier est l'identifiant de la
-- séance — et renvoyés aux mêmes fonctions que la séance.
--
-- Le chemin est analysé dans une fonction plutôt qu'en ligne dans la
-- politique : « ::uuid » sur un dossier qui n'en est pas un lève une erreur et
-- ferait échouer toute la requête, y compris pour les fichiers valides.

create or replace function public.lesson_entry_of_object(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  dossiers text[];
begin
  dossiers := storage.foldername(object_name);
  if array_length(dossiers, 1) is null or array_length(dossiers, 1) < 2 then
    return null;
  end if;
  -- Un dossier qui n'est pas un identifiant n'appartient à aucune séance :
  -- on rend « null », et la politique refusera.
  if dossiers[2] !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  return dossiers[2]::uuid;
end;
$$;

revoke all on function public.lesson_entry_of_object(text) from public;
grant execute on function public.lesson_entry_of_object(text) to authenticated;

drop policy if exists cahier_files_read on storage.objects;
create policy cahier_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cahier-de-textes'
    and public.can_read_lesson_entry(public.lesson_entry_of_object(name))
  );

drop policy if exists cahier_files_insert on storage.objects;
create policy cahier_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cahier-de-textes'
    and public.can_write_lesson_entry(public.lesson_entry_of_object(name))
  );

drop policy if exists cahier_files_delete on storage.objects;
create policy cahier_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cahier-de-textes'
    and public.can_write_lesson_entry(public.lesson_entry_of_object(name))
  );

notify pgrst, 'reload schema';
