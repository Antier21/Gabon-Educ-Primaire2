-- Gabon Éduc+ — Nettoyage des comptes de démonstration
--
-- CE FICHIER N'EST PAS UNE MIGRATION. Il ne va pas dans supabase/migrations/ :
-- il ne décrit pas la structure de la base mais un ménage ponctuel, propre à
-- cette installation. Le rejouer ailleurs n'aurait aucun sens.
--
-- Exécutez les sections DANS L'ORDRE, et lisez le résultat de chacune avant de
-- passer à la suivante. Les sections 1 et 2 ne détruisent rien : elles
-- constatent. Les sections 3 à 5 suppriment.
--
-- Principe retenu, le même que dans l'application : refuser et expliquer.
-- Aucun compte auquel des données sont rattachées ne sera supprimé de force ;
-- il sera conservé et nommé, à vous de décider.

-- ===========================================================================
-- SECTION 1 — INVENTAIRE (ne détruit rien)
-- ===========================================================================

select 'Comptes au total' as element, count(*)::text as valeur from auth.users
union all
select 'Comptes de test (@test.gaboneduc.local)', count(*)::text
  from auth.users where email like '%@test.gaboneduc.local'
union all
select 'Comptes d''essai (@example.com, @isolation.com)', count(*)::text
  from auth.users where email like '%@example.com' or email like '%@isolation.com'
union all
select 'Comptes réels conservés', count(*)::text
  from auth.users
  where email not like '%@test.gaboneduc.local'
    and email not like '%@example.com'
    and email not like '%@isolation.com'
union all
select 'Rôles globaux en double', count(*)::text from (
  select user_id, role from public.user_roles
  group by user_id, role having count(*) > 1
) d
union all
select 'Élèves enregistrés', count(*)::text from public.student_records
union all
select 'Responsables enregistrés', count(*)::text from public.guardians;

-- ===========================================================================
-- SECTION 2 — LE COMPTE PARENT QUI PORTE LE RÔLE DE SUPER-ADMINISTRATEUR
-- ===========================================================================
-- À lire avant la section 3. Ce compte doit apparaître avec « parent » et
-- rien d'autre. S'il porte « super_admin », il peut aujourd'hui lire tous les
-- bulletins de l'établissement et supprimer l'établissement lui-même.

select
  u.email,
  'rôle global' as origine,
  ur.role::text as role
from auth.users u
join public.user_roles ur on ur.user_id = u.id
where u.email = 'irene27@access.gaboneducplus.app'
union all
select
  u.email,
  'rôle établissement',
  sm.role::text
from auth.users u
join public.school_memberships sm on sm.user_id = u.id
where u.email = 'irene27@access.gaboneducplus.app';

-- ===========================================================================
-- SECTION 3 — RETIRER LES RÔLES INDUS DU COMPTE PARENT
-- ===========================================================================
-- N'exécutez cette section qu'après avoir lu la section 2 et confirmé qu'il
-- s'agit bien d'un compte de parent d'élève.

delete from public.user_roles ur
using auth.users u
where ur.user_id = u.id
  and u.email = 'irene27@access.gaboneducplus.app'
  and ur.role::text <> 'parent';

delete from public.school_memberships sm
using auth.users u
where sm.user_id = u.id
  and u.email = 'irene27@access.gaboneducplus.app'
  and sm.role::text <> 'parent';

-- Contrôle : ne doit plus renvoyer que des lignes « parent ».
select u.email, ur.role::text as role_global
from auth.users u join public.user_roles ur on ur.user_id = u.id
where u.email = 'irene27@access.gaboneducplus.app';

-- ===========================================================================
-- SECTION 4 — DÉDOUBLONNER LES RÔLES GLOBAUX
-- ===========================================================================
-- Plusieurs comptes portent deux fois le même rôle, l'un rattaché à un
-- établissement et l'autre non. Sans danger, mais chaque vérification de
-- droits parcourt ces lignes inutilement. On conserve la plus ancienne.

delete from public.user_roles ur
where ur.id in (
  select id from (
    select
      id,
      row_number() over (
        partition by user_id, role
        order by created_at asc, id asc
      ) as rang
    from public.user_roles
  ) classement
  where rang > 1
);

select count(*) as doublons_restants from (
  select user_id, role from public.user_roles
  group by user_id, role having count(*) > 1
) d;

-- ===========================================================================
-- SECTION 5 — SUPPRIMER LES COMPTES DE DÉMONSTRATION
-- ===========================================================================
-- Chaque compte est tenté séparément. Celui auquel des données sont
-- rattachées — un élève qu'il a inscrit, une note qu'il a saisie — est
-- conservé et nommé dans les messages, plutôt que supprimé de force en
-- entraînant ces données avec lui.
--
-- Les comptes réels (@gmail.com, @hotmail.com, @access.gaboneducplus.app) ne
-- sont jamais touchés.

do $$
declare
  compte record;
  supprimes integer := 0;
  conserves integer := 0;
begin
  for compte in
    select id, email
    from auth.users
    where email like '%@test.gaboneduc.local'
       or email like '%@example.com'
       or email like '%@isolation.com'
    order by email
  loop
    begin
      delete from auth.users where id = compte.id;
      supprimes := supprimes + 1;
    exception
      when foreign_key_violation then
        conserves := conserves + 1;
        raise notice 'CONSERVÉ — des données lui sont rattachées : %', compte.email;
      when others then
        conserves := conserves + 1;
        raise notice 'CONSERVÉ — % : %', compte.email, sqlerrm;
    end;
  end loop;
  raise notice '---';
  raise notice '% compte(s) supprimé(s), % conservé(s).', supprimes, conserves;
end;
$$;

-- ===========================================================================
-- SECTION 6 — CONTRÔLE FINAL
-- ===========================================================================

select 'Comptes restants' as element, count(*)::text as valeur from auth.users
union all
select 'Dont comptes de démonstration', count(*)::text
  from auth.users
  where email like '%@test.gaboneduc.local'
     or email like '%@example.com'
     or email like '%@isolation.com'
union all
select 'Rôles globaux en double', count(*)::text from (
  select user_id, role from public.user_roles
  group by user_id, role having count(*) > 1
) d;
