-- Gabon Éduc+ Primaire v0.12.0-primary.14
-- Lecture sécurisée des abonnements pour le compte global GABON EDUC+ SERVICE.
-- Migration additive : aucune suppression et aucune réinitialisation de données.

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
