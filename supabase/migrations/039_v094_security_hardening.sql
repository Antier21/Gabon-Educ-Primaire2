-- GABON Éduc+ v0.9.4 — durcissement abonnement et audit
-- À exécuter après 038_v093_subscription_write_guards.sql.

-- Résultat d’audit sans doublons (information_schema expose une ligne par événement).
create or replace function public.list_subscription_guarded_tables()
returns table(table_name text, trigger_name text)
language sql
stable
security definer
set search_path=public
as $$
  select distinct event_object_table::text, trigger_name::text
  from information_schema.triggers
  where trigger_schema='public'
    and trigger_name like 'trg_subscription_guard_%'
  order by event_object_table, trigger_name;
$$;

-- Contrôle explicite utilisable par le client avant toute écriture locale.
revoke all on function public.school_can_write(uuid) from public;
grant execute on function public.school_can_write(uuid) to authenticated;

-- Vérifie qu’aucune table métier avec school_id n’est restée sans garde.
create or replace function public.list_unguarded_school_tables()
returns table(table_name text)
language sql
stable
security definer
set search_path=public
as $$
  select distinct c.table_name::text
  from information_schema.columns c
  where c.table_schema='public'
    and c.column_name='school_id'
    and c.table_name not in ('school_subscriptions','subscription_payments','subscription_status_logs')
    and not exists (
      select 1 from information_schema.triggers t
      where t.trigger_schema='public'
        and t.event_object_table=c.table_name
        and t.trigger_name='trg_subscription_guard_'||c.table_name
    )
  order by 1;
$$;
revoke all on function public.list_unguarded_school_tables() from public;
grant execute on function public.list_unguarded_school_tables() to authenticated;
