-- Gabon Éduc+ Primaire — phase 2 du verrouillage des créations d'établissement
--
-- Migration additive : elle prépare le sas d'activation et la nouvelle RPC
-- d'enregistrement. L'ancienne RPC reste temporairement exécutable afin de
-- permettre un déploiement sans coupure. Son accès direct sera retiré après
-- validation du nouveau parcours en production.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.school_registration_authorizations (
  id uuid primary key default gen_random_uuid(),
  activation_code_id uuid not null references public.school_activation_codes(id) on delete cascade,
  token_hash text not null unique,
  edition text not null check (edition in ('primary', 'secondary')),
  school_name text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id),
  school_id uuid references public.schools(id)
);

create index if not exists school_registration_authorizations_activation_idx
  on public.school_registration_authorizations (activation_code_id, issued_at desc);

create index if not exists school_registration_authorizations_expiry_idx
  on public.school_registration_authorizations (expires_at);

alter table public.school_registration_authorizations enable row level security;
revoke all on table public.school_registration_authorizations from anon, authenticated;

-- Les nouveaux codes sont plus longs que ceux de la phase 1 (64 bits de
-- hasard au lieu de 32). Les codes déjà émis restent parfaitement valides.
create or replace function public.create_school_activation_code(
  p_school_name text,
  p_expires_at timestamptz,
  p_max_uses integer default 1,
  p_edition text default 'primary'
)
returns table(
  activation_id uuid,
  plain_code text,
  code_hint text,
  school_name text,
  edition text,
  effective_status text,
  max_uses integer,
  usage_count integer,
  expires_at timestamptz,
  issued_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token text;
  v_code text;
  v_prefix text;
  v_created public.school_activation_codes%rowtype;
  v_attempt integer := 0;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Accès réservé au super administrateur.' using errcode = '42501';
  end if;

  p_school_name := btrim(coalesce(p_school_name, ''));
  p_edition := lower(btrim(coalesce(p_edition, 'primary')));

  if length(p_school_name) < 3 then
    raise exception 'Indiquez le nom de l’établissement concerné.' using errcode = '22023';
  end if;

  if p_edition not in ('primary', 'secondary') then
    raise exception 'Édition Gabon Éduc+ inconnue.' using errcode = '22023';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'La date d’expiration doit être future.' using errcode = '22023';
  end if;

  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 20 then
    raise exception 'Le nombre d’utilisations doit être compris entre 1 et 20.' using errcode = '22023';
  end if;

  v_prefix := case when p_edition = 'primary' then 'P' else 'S' end;

  loop
    v_attempt := v_attempt + 1;
    v_token := upper(encode(gen_random_bytes(8), 'hex'));
    v_code := 'GEPS-' || v_prefix || '-' ||
      substr(v_token, 1, 4) || '-' || substr(v_token, 5, 4) || '-' ||
      substr(v_token, 9, 4) || '-' || substr(v_token, 13, 4);

    begin
      insert into public.school_activation_codes (
        code_hash,
        code_hint,
        school_name,
        edition,
        max_uses,
        expires_at,
        issued_by
      ) values (
        encode(digest(v_code, 'sha256'), 'hex'),
        'GEPS-' || v_prefix || '-••••-••••-••••-' || substr(v_token, 13, 4),
        p_school_name,
        p_edition,
        p_max_uses,
        p_expires_at,
        auth.uid()
      )
      returning * into v_created;

      return query
      select
        v_created.id,
        v_code,
        v_created.code_hint,
        v_created.school_name,
        v_created.edition,
        'active'::text,
        v_created.max_uses,
        v_created.usage_count,
        v_created.expires_at,
        v_created.issued_at;
      return;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise exception 'Impossible de générer un code unique. Réessayez.';
      end if;
    end;
  end loop;
end;
$$;

-- Valide un code GEPS sans le consommer et émet un jeton opaque temporaire.
-- Ce jeton est la seule information conservée dans le navigateur pendant le
-- parcours d'ouverture du compte responsable.
create or replace function public.begin_school_registration(
  p_code text,
  p_edition text default 'primary'
)
returns table(
  registration_token text,
  school_name text,
  authorization_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_code text;
  v_edition text;
  v_activation public.school_activation_codes%rowtype;
  v_token text;
  v_authorization_expires_at timestamptz;
begin
  v_code := upper(regexp_replace(btrim(coalesce(p_code, '')), '\s+', '', 'g'));
  v_edition := lower(btrim(coalesce(p_edition, 'primary')));

  if v_edition not in ('primary', 'secondary') then
    raise exception 'Édition Gabon Éduc+ inconnue.' using errcode = '22023';
  end if;

  if length(v_code) < 10 then
    raise exception 'Code d’activation invalide ou indisponible.' using errcode = '22023';
  end if;

  select c.*
  into v_activation
  from public.school_activation_codes c
  where c.code_hash = encode(digest(v_code, 'sha256'), 'hex')
  for update;

  if not found
     or v_activation.status <> 'active'
     or v_activation.edition <> v_edition
     or v_activation.expires_at <= now()
     or v_activation.usage_count >= v_activation.max_uses then
    raise exception 'Code d’activation invalide ou indisponible.' using errcode = '22023';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_authorization_expires_at := least(v_activation.expires_at, now() + interval '2 hours');

  insert into public.school_registration_authorizations (
    activation_code_id,
    token_hash,
    edition,
    school_name,
    expires_at
  ) values (
    v_activation.id,
    encode(digest(v_token, 'sha256'), 'hex'),
    v_activation.edition,
    v_activation.school_name,
    v_authorization_expires_at
  );

  return query
  select v_token, v_activation.school_name, v_authorization_expires_at;
end;
$$;

-- Permet aux pages intermédiaires de vérifier qu'un jeton temporaire est
-- encore valable, sans exposer les lignes internes de la table.
create or replace function public.check_school_registration_authorization(
  p_registration_token text,
  p_edition text default 'primary'
)
returns table(
  is_valid boolean,
  school_name text,
  authorization_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    true,
    a.school_name,
    a.expires_at
  from public.school_registration_authorizations a
  join public.school_activation_codes c on c.id = a.activation_code_id
  where a.token_hash = encode(digest(coalesce(p_registration_token, ''), 'sha256'), 'hex')
    and a.edition = lower(btrim(coalesce(p_edition, 'primary')))
    and a.consumed_at is null
    and a.expires_at > now()
    and c.status = 'active'
    and c.expires_at > now()
    and c.usage_count < c.max_uses
  limit 1;
$$;

-- Nouvelle porte d'entrée pour la création réelle. Le code est consommé
-- uniquement après la création réussie de l'établissement.
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
  set
    consumed_at = now(),
    consumed_by = v_user_id,
    school_id = v_created_school_id
  where id = v_authorization.id;

  update public.school_activation_codes
  set
    usage_count = usage_count + 1,
    used_at = now(),
    used_by = v_user_id,
    used_school_id = v_created_school_id
  where id = v_activation.id;

  return v_created_school_id;
end;
$$;

revoke all on function public.begin_school_registration(text,text) from public;
revoke all on function public.check_school_registration_authorization(text,text) from public;
revoke all on function public.register_school_from_activation(text,text,text,text,text,text,text,text,text,text,text) from public;

grant execute on function public.begin_school_registration(text,text) to anon, authenticated;
grant execute on function public.check_school_registration_authorization(text,text) to anon, authenticated;
grant execute on function public.register_school_from_activation(text,text,text,text,text,text,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
