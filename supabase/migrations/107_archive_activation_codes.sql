-- Gabon Éduc+ Primaire — archivage des codes d’activation
--
-- Les lignes supprimées du Centre de pilotage restent conservées en base pour
-- l’audit. Un code actif doit d’abord être révoqué ; seuls les codes révoqués,
-- expirés ou totalement utilisés peuvent être archivés.

alter table public.school_activation_codes
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id);

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
  where c.archived_at is null
  order by c.issued_at desc;
end;
$$;

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
      status = 'revoked'
      or usage_count >= max_uses
      or expires_at <= now()
    )
  returning id into v_updated;

  return v_updated is not null;
end;
$$;

revoke all on function public.archive_school_activation_code(uuid) from public;
grant execute on function public.archive_school_activation_code(uuid) to authenticated;

notify pgrst, 'reload schema';
