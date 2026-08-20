-- Gabon Éduc+ Primaire v0.12.0-primary.12
-- Le contrôle d'abonnement ne doit répondre que pour un établissement auquel
-- la session appartient. Les politiques RLS restent également actives.

create or replace function public.school_can_write_strict(target_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (public.belongs_to_school(target_school) or public.is_super_admin())
    and exists (
      select 1
      from public.school_subscriptions s
      where s.school_id = target_school
        and (
          (s.status in ('trial', 'active') and now() <= s.expires_at)
          or (
            s.status = 'grace_period'
            and s.grace_period_ends_at is not null
            and now() <= s.grace_period_ends_at
          )
          or (
            s.status not in ('suspended', 'cancelled', 'expired')
            and now() > s.expires_at
            and s.grace_period_ends_at is not null
            and now() <= s.grace_period_ends_at
          )
        )
    );
$$;

revoke all on function public.school_can_write_strict(uuid) from public;
grant execute on function public.school_can_write_strict(uuid) to authenticated;

comment on function public.school_can_write_strict(uuid)
is 'Autorise l’écriture uniquement pour l’établissement actif de la session et si son abonnement le permet.';
