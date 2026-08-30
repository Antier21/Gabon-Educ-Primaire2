-- Gabon Éduc+ Primaire — phase 1 du verrouillage des créations d'établissement
--
-- Cette migration prépare les codes d'activation gérés exclusivement par le
-- super-admin. Elle NE modifie pas encore le parcours d'inscription : aucun
-- établissement existant ou futur n'est bloqué tant que la phase 2 n'est pas
-- déployée.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.school_activation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  school_name text not null,
  edition text not null default 'primary'
    check (edition in ('primary', 'secondary')),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  max_uses integer not null default 1
    check (max_uses between 1 and 20),
  usage_count integer not null default 0
    check (usage_count >= 0 and usage_count <= max_uses),
  expires_at timestamptz not null,
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  used_at timestamptz,
  used_by uuid references auth.users(id),
  used_school_id uuid references public.schools(id)
);

create index if not exists school_activation_codes_issued_at_idx
  on public.school_activation_codes (issued_at desc);
create index if not exists school_activation_codes_expires_at_idx
  on public.school_activation_codes (expires_at);

alter table public.school_activation_codes enable row level security;

-- La table n'est jamais exposée directement au navigateur. Toutes les actions
-- passent par les RPC SECURITY DEFINER ci-dessous qui revérifient le rôle.
revoke all on table public.school_activation_codes from anon, authenticated;

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
    v_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    v_code := 'GEPS-' || v_prefix || '-' || substr(v_token, 1, 4) || '-' || substr(v_token, 5, 4);

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
        'GEPS-' || v_prefix || '-••••-' || substr(v_token, 5, 4),
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
      when c.usage_count >= c.max_uses then 'used'
      when c.expires_at <= now() then 'expired'
      else 'active'
    end::text,
    c.max_uses,
    c.usage_count,
    c.expires_at,
    c.issued_at,
    c.revoked_at
  from public.school_activation_codes c
  order by c.issued_at desc;
end;
$$;

create or replace function public.revoke_school_activation_code(p_activation_id uuid)
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
    status = 'revoked',
    revoked_at = now(),
    revoked_by = auth.uid()
  where id = p_activation_id
    and status = 'active'
    and usage_count < max_uses
  returning id into v_updated;

  return v_updated is not null;
end;
$$;

revoke all on function public.create_school_activation_code(text, timestamptz, integer, text) from public;
revoke all on function public.list_school_activation_codes() from public;
revoke all on function public.revoke_school_activation_code(uuid) from public;

grant execute on function public.create_school_activation_code(text, timestamptz, integer, text) to authenticated;
grant execute on function public.list_school_activation_codes() to authenticated;
grant execute on function public.revoke_school_activation_code(uuid) to authenticated;

notify pgrst, 'reload schema';
