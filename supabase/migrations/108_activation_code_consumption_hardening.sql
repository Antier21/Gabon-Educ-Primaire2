-- Gabon Éduc+ Primaire — durcissement final des codes d’activation
--
-- Objectifs :
-- 1) matérialiser l’état « used » dans la table des codes ;
-- 2) réserver/consommer le code AVANT la création, dans la même transaction ;
-- 3) fermer l’ancienne RPC publique d’onboarding afin qu’aucune création ne
--    puisse contourner register_school_from_activation ;
-- 4) remettre en cohérence les compteurs à partir des autorisations déjà
--    consommées lorsque cette information existe.

-- La migration 105 n’autorisait que active/revoked. Un code arrivé à sa
-- dernière utilisation possède désormais un véritable état terminal « used ».
alter table public.school_activation_codes
  drop constraint if exists school_activation_codes_status_check;

alter table public.school_activation_codes
  add constraint school_activation_codes_status_check
  check (status in ('active', 'revoked', 'used'));

-- Répare, lorsque c’est possible, les compteurs à partir des autorisations
-- déjà consommées. Une révocation manuelle reste prioritaire et n’est jamais
-- transformée en « used » par ce rattrapage.
with consumed as (
  select
    activation_code_id,
    count(*)::integer as consumed_count,
    max(consumed_at) as last_consumed_at,
    (array_agg(consumed_by order by consumed_at desc))[1] as last_consumed_by,
    (array_agg(school_id order by consumed_at desc))[1] as last_school_id
  from public.school_registration_authorizations
  where consumed_at is not null
  group by activation_code_id
)
update public.school_activation_codes c
set
  usage_count = least(c.max_uses, greatest(c.usage_count, x.consumed_count)),
  used_at = coalesce(c.used_at, x.last_consumed_at),
  used_by = coalesce(c.used_by, x.last_consumed_by),
  used_school_id = coalesce(c.used_school_id, x.last_school_id),
  status = case
    when c.status = 'revoked' then 'revoked'
    when least(c.max_uses, greatest(c.usage_count, x.consumed_count)) >= c.max_uses then 'used'
    else c.status
  end
from consumed x
where c.id = x.activation_code_id;

-- La liste visible s’appuie d’abord sur l’état persistant, tout en gardant le
-- compteur comme filet de sécurité pour les anciennes lignes.
create or replace function public.list_school_activation_codes()
returns table(
  activation_id uuid,
  code_hint text,
  school_name text,
  edition text,
  effective_status text,
  max_uses integer,
  usage_count integer,
  expires_at timestamptz,
  issued_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Accès réservé au super administrateur.' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.code_hint,
    c.school_name,
    c.edition,
    case
      when c.status = 'revoked' then 'revoked'
      when c.status = 'used' or c.usage_count >= c.max_uses then 'used'
      when c.expires_at <= now() then 'expired'
      else 'active'
    end::text,
    c.max_uses,
    c.usage_count,
    c.expires_at,
    c.issued_at,
    c.revoked_at
  from public.school_activation_codes c
  where c.archived_at is null
  order by c.issued_at desc;
end;
$$;

-- Porte unique de création d’un établissement.
--
-- La consommation est effectuée avant l’appel à register_school_from_onboarding
-- mais dans LA MÊME transaction PostgreSQL. Si la création échoue ensuite,
-- PostgreSQL annule automatiquement la consommation et le code reste disponible.
create or replace function public.register_school_from_activation(
  p_registration_token text,
  school_name text,
  requested_school_type text,
  requested_school_sector text,
  registration_number text default '',
  province_name text default 'Estuaire',
  city_name text default 'Libreville',
  school_address text default '',
  school_phone text default '',
  school_email text default '',
  academic_year_label text default '2026-2027'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_authorization public.school_registration_authorizations%rowtype;
  v_activation public.school_activation_codes%rowtype;
  v_created_school_id uuid;
  v_reserved_activation_id uuid;
  v_reserved_authorization_id uuid;
begin
  if v_user_id is null then
    raise exception 'Utilisateur non connecté.' using errcode = '42501';
  end if;

  select a.*
  into v_authorization
  from public.school_registration_authorizations a
  where a.token_hash = encode(digest(coalesce(p_registration_token, ''), 'sha256'), 'hex')
  for update;

  if not found
     or v_authorization.consumed_at is not null
     or v_authorization.expires_at <= now() then
    raise exception 'Autorisation d’activation absente ou expirée.' using errcode = '42501';
  end if;

  select c.*
  into v_activation
  from public.school_activation_codes c
  where c.id = v_authorization.activation_code_id
  for update;

  if not found
     or v_activation.status <> 'active'
     or v_activation.expires_at <= now()
     or v_activation.usage_count >= v_activation.max_uses
     or v_activation.edition <> v_authorization.edition then
    raise exception 'Le code d’activation n’est plus utilisable.' using errcode = '42501';
  end if;

  if lower(btrim(coalesce(school_name, ''))) <> lower(btrim(v_authorization.school_name)) then
    raise exception 'Le nom de l’établissement doit correspondre à l’autorisation GEPS : %', v_authorization.school_name
      using errcode = '22023';
  end if;

  -- Réservation atomique de l’utilisation. L’expression utilise les anciennes
  -- valeurs de la ligne : si usage_count + 1 atteint max_uses, le code devient
  -- immédiatement « used ».
  update public.school_activation_codes
  set
    usage_count = usage_count + 1,
    status = case when usage_count + 1 >= max_uses then 'used' else 'active' end,
    used_at = now(),
    used_by = v_user_id
  where id = v_activation.id
    and status = 'active'
    and expires_at > now()
    and usage_count < max_uses
  returning id into v_reserved_activation_id;

  if v_reserved_activation_id is null then
    raise exception 'Le code d’activation vient d’être utilisé ou n’est plus disponible.' using errcode = '42501';
  end if;

  update public.school_registration_authorizations
  set
    consumed_at = now(),
    consumed_by = v_user_id
  where id = v_authorization.id
    and consumed_at is null
    and expires_at > now()
  returning id into v_reserved_authorization_id;

  if v_reserved_authorization_id is null then
    raise exception 'Cette autorisation a déjà été utilisée ou a expiré.' using errcode = '42501';
  end if;

  -- L’ancienne fonction reste l’implémentation interne de création. Ses droits
  -- directs sont retirés plus bas ; seul ce wrapper SECURITY DEFINER l’appelle.
  v_created_school_id := public.register_school_from_onboarding(
    v_authorization.school_name,
    requested_school_type,
    requested_school_sector,
    registration_number,
    province_name,
    city_name,
    school_address,
    school_phone,
    school_email,
    academic_year_label
  );

  update public.school_registration_authorizations
  set school_id = v_created_school_id
  where id = v_authorization.id;

  update public.school_activation_codes
  set used_school_id = v_created_school_id
  where id = v_activation.id;

  return v_created_school_id;
end;
$$;

-- Archivage : « used » est maintenant un état terminal explicite.
create or replace function public.archive_school_activation_code(
  p_activation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated uuid;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Accès réservé au super administrateur.' using errcode = '42501';
  end if;

  update public.school_activation_codes
  set
    archived_at = now(),
    archived_by = auth.uid()
  where id = p_activation_id
    and archived_at is null
    and (
      status in ('revoked', 'used')
      or usage_count >= max_uses
      or expires_at <= now()
    )
  returning id into v_updated;

  return v_updated is not null;
end;
$$;

-- Fermeture définitive de l’ancienne porte publique. Le propriétaire de la
-- fonction (qui exécute register_school_from_activation en SECURITY DEFINER)
-- conserve son droit intrinsèque d’appel interne.
revoke all on function public.register_school_from_onboarding(
  text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;

revoke all on function public.register_school_from_activation(
  text,text,text,text,text,text,text,text,text,text,text
) from public;

grant execute on function public.register_school_from_activation(
  text,text,text,text,text,text,text,text,text,text,text
) to authenticated;

revoke all on function public.archive_school_activation_code(uuid) from public;
grant execute on function public.archive_school_activation_code(uuid) to authenticated;

comment on function public.register_school_from_onboarding(
  text,text,text,text,text,text,text,text,text,text
) is 'Implémentation interne de création d’établissement. Accès direct retiré : utiliser register_school_from_activation.';

comment on function public.register_school_from_activation(
  text,text,text,text,text,text,text,text,text,text,text
) is 'Porte unique d’onboarding : exige une autorisation GEPS et consomme atomiquement le code dans la transaction de création.';

notify pgrst, 'reload schema';
