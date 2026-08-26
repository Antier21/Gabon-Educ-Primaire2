-- Gabon Éduc+ — L'en-tête du bulletin appartient à l'établissement
--
-- L'en-tête était écrit en dur dans le composant, d'après le bulletin qui a
-- servi de modèle : « Direction d'Académie Provinciale de l'Estuaire »,
-- « Circonscription Scolaire Libreville-Est ». Une école de Port-Gentil aurait
-- imprimé la mauvaise académie et la mauvaise circonscription sur un document
-- officiel — une erreur qui décrédibilise le document entier, et le logiciel
-- avec lui.
--
-- Ces lignes deviennent donc des données de l'établissement, comme les
-- domaines et les barèmes.

alter table public.school_report_settings
  add column if not exists authority_line1 text not null default 'Ministère de l''Éducation Nationale',
  add column if not exists authority_line2 text not null default '',
  add column if not exists authority_line3 text not null default '',
  add column if not exists school_subtitle1 text not null default '',
  add column if not exists school_subtitle2 text not null default '',
  add column if not exists show_logo boolean not null default true;

-- Une famille n'appartient pas à l'établissement.
--
-- Même forme que « is_family_of_class » : la vérification vit dans une
-- fonction « security definer », dont le corps s'exécute hors politiques. Une
-- politique qui interrogerait « student_records » depuis une table que
-- « student_records » référence en retour produirait la récursion infinie que
-- nous avons déjà rencontrée sur « class_groups ».
create or replace function public.is_family_of_school(target_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.student_records sr
    where sr.school_id = target_school
      and public.is_family_of(sr.id)
  );
$$;

revoke all on function public.is_family_of_school(uuid) from public;
grant execute on function public.is_family_of_school(uuid) to authenticated;

/*
 * L'en-tête, assemblé en une seule lecture.
 *
 * Il tient dans deux tables — l'identité dans « schools », les lignes de
 * tutelle dans « school_report_settings » — et il est lu par des gens qui
 * n'ont pas les mêmes droits : le personnel, mais aussi les familles, qui
 * doivent voir le bulletin complet de leur enfant.
 *
 * Plutôt que d'ouvrir ces deux tables à la lecture des familles, on expose une
 * fonction qui ne rend que l'en-tête, et qui vérifie elle-même qui appelle. La
 * surface ouverte se limite ainsi à ce qui s'imprime sur le document.
 */
create or replace function public.get_report_header(target_school uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ecole record;
  reglages record;
begin
  if not (
    public.belongs_to_school(target_school)
    or public.is_family_of_school(target_school)
    or public.is_super_admin()
  ) then
    raise exception 'Accès refusé à l''en-tête de cet établissement.';
  end if;

  select name, logo_url, province, city into ecole
    from public.schools where id = target_school;
  -- « not found » et non « ecole is null » : sur une variable record, la
  -- comparaison à null ne serait vraie que si *tous* les champs étaient nuls,
  -- et une école sans logo ni province passerait pour inexistante.
  if not found then
    raise exception 'Établissement introuvable.';
  end if;

  select authority_line1, authority_line2, authority_line3,
         school_subtitle1, school_subtitle2, show_logo
    into reglages
    from public.school_report_settings where school_id = target_school;

  return jsonb_build_object(
    'schoolName', coalesce(ecole.name, ''),
    'logoUrl', case when coalesce(reglages.show_logo, true)
                    then coalesce(ecole.logo_url, '') else '' end,
    'province', coalesce(ecole.province, ''),
    'city', coalesce(ecole.city, ''),
    'authority1', coalesce(reglages.authority_line1, 'Ministère de l''Éducation Nationale'),
    'authority2', coalesce(reglages.authority_line2, ''),
    'authority3', coalesce(reglages.authority_line3, ''),
    'subtitle1', coalesce(reglages.school_subtitle1, ''),
    'subtitle2', coalesce(reglages.school_subtitle2, '')
  );
end;
$$;

revoke all on function public.get_report_header(uuid) from public;
grant execute on function public.get_report_header(uuid) to authenticated;

notify pgrst, 'reload schema';
