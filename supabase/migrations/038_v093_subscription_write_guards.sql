-- GABON Éduc+ v0.9.3 — verrouillage transversal des écritures
-- À exécuter après 037_v092_subscriptions_licences.sql.

create or replace function public.enforce_school_subscription_write()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  target_school uuid;
begin
  target_school := case when tg_op='DELETE' then old.school_id else new.school_id end;
  if target_school is not null and not public.school_can_write(target_school) then
    raise exception using
      errcode='42501',
      message='ABONNEMENT_REQUIS: écriture suspendue; les données restent consultables.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

-- Pose automatiquement un garde sur chaque table métier possédant une colonne school_id.
-- Les tables de gestion des abonnements sont exclues : elles restent pilotées par leurs RLS et le super_admin.
do $$
declare
  item record;
  trigger_name text;
begin
  for item in
    select c.table_name
    from information_schema.columns c
    where c.table_schema='public'
      and c.column_name='school_id'
      and c.table_name not in (
        'school_subscriptions',
        'subscription_payments',
        'subscription_status_logs'
      )
    group by c.table_name
  loop
    trigger_name := 'trg_subscription_guard_' || item.table_name;
    execute format('drop trigger if exists %I on public.%I', trigger_name, item.table_name);
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function public.enforce_school_subscription_write()',
      trigger_name,
      item.table_name
    );
  end loop;
end $$;

-- Vérification pratique : renvoie les tables protégées.
create or replace function public.list_subscription_guarded_tables()
returns table(table_name text, trigger_name text)
language sql
stable
security definer
set search_path=public
as $$
  select event_object_table::text, trigger_name::text
  from information_schema.triggers
  where trigger_schema='public'
    and trigger_name like 'trg_subscription_guard_%'
  order by event_object_table;
$$;

revoke all on function public.list_subscription_guarded_tables() from public;
grant execute on function public.list_subscription_guarded_tables() to authenticated;
