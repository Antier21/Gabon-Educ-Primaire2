-- Gabon Éduc+ Primaire — réparation de la lecture des abonnements
--
-- Symptôme corrigé : « Could not find the function public.get_service_subscriptions
-- without parameters in the schema cache ».
--
-- Deux causes possibles, traitées toutes les deux ici :
--   1. la fonction de la migration 062 n'a jamais été appliquée à cette base ;
--   2. elle existe, mais PostgREST ne l'a pas encore vue (cache de schéma).
--
-- Migration additive : aucune donnée n'est supprimée ni réinitialisée.

-- ---------------------------------------------------------------------------
-- 1. Vérification des dépendances
-- ---------------------------------------------------------------------------
-- is_super_admin() est indispensable : sans elle, la fonction ci-dessous ne
-- peut pas être créée. Si le message d'erreur mentionne is_super_admin, c'est
-- la migration 060 ou 061 qu'il faut appliquer avant celle-ci.

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_super_admin'
  ) then
    raise exception 'La fonction public.is_super_admin() est absente : appliquez d’abord les migrations 060 et 061.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. (Re)création de la fonction
-- ---------------------------------------------------------------------------

create or replace function public.get_service_subscriptions()
returns table(
  school_id uuid,
  plan_code text,
  status public.subscription_status,
  expires_at timestamptz,
  grace_period_ends_at timestamptz,
  school_name text,
  school_type text,
  school_sector text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé à Gabon Éduc+ Service' using errcode = '42501';
  end if;

  return query
  select
    s.school_id,
    s.plan_code,
    s.status,
    s.expires_at,
    s.grace_period_ends_at,
    e.name::text,
    e.school_type::text,
    e.school_sector::text
  from public.school_subscriptions s
  join public.schools e on e.id = s.school_id
  order by s.expires_at;
end;
$$;

revoke all on function public.get_service_subscriptions() from public;
grant execute on function public.get_service_subscriptions() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rechargement du cache de schéma
-- ---------------------------------------------------------------------------
-- PostgREST tient en mémoire la liste des fonctions exposées. Sans ce signal,
-- une fonction fraîchement créée reste introuvable pendant plusieurs minutes,
-- et l'application continue d'afficher la même erreur alors que la base est
-- correcte.

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 4. Contrôle
-- ---------------------------------------------------------------------------
-- La requête suivante doit renvoyer une ligne. Si elle n'en renvoie aucune,
-- la création a échoué et le message d'erreur du bloc ci-dessus l'explique.

select
  p.proname as fonction,
  pg_get_function_identity_arguments(p.oid) as parametres,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_service_subscriptions';
