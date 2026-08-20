-- Gabon Éduc+ v0.9.4.3
-- Contrôle strict de l'abonnement pour les tests de rôle Administration.
-- Contrairement à school_can_write(), cette fonction n'accorde aucune
-- dérogation liée au rôle réel super_admin de la session.

create or replace function public.school_can_write_strict(target_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_subscriptions s
    where s.school_id = target_school
      and (
        (s.status in ('trial', 'active') and now() <= s.expires_at)
        or
        (
          s.status = 'grace_period'
          and s.grace_period_ends_at is not null
          and now() <= s.grace_period_ends_at
        )
        or
        (
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
