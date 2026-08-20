-- Gabon Éduc+ v0.9.2 — abonnements, licences et suspension progressive
do $$ begin
  create type public.subscription_status as enum ('trial','active','grace_period','suspended','expired','cancelled');
exception when duplicate_object then null; end $$;

create table public.school_subscriptions(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references public.schools(id) on delete cascade,
  plan_code text not null default 'pilot',
  status public.subscription_status not null default 'trial',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  grace_period_ends_at timestamptz,
  last_payment_at timestamptz,
  next_payment_due_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  offline_licence_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(grace_period_ends_at is null or grace_period_ends_at >= expires_at)
);

create table public.subscription_payments(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  subscription_id uuid references public.school_subscriptions(id) on delete set null,
  amount numeric(12,2) not null check(amount >= 0),
  currency text not null default 'XAF',
  payment_method text,
  payment_reference text,
  payment_status text not null default 'pending' check(payment_status in ('pending','confirmed','rejected','refunded')),
  paid_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.subscription_status_logs(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  previous_status public.subscription_status,
  new_status public.subscription_status not null,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index idx_school_subscriptions_status on public.school_subscriptions(status, expires_at);
create index idx_subscription_payments_school on public.subscription_payments(school_id, created_at desc);
create index idx_subscription_logs_school on public.subscription_status_logs(school_id, changed_at desc);

create or replace function public.subscription_effective_status(target_school uuid)
returns public.subscription_status language plpgsql stable security definer set search_path=public as $$
declare s public.school_subscriptions%rowtype;
begin
  if public.is_super_admin() then return 'active'; end if;
  select * into s from public.school_subscriptions where school_id=target_school;
  if not found then return 'suspended'; end if;
  if s.status in ('cancelled','suspended') then return s.status; end if;
  if now() <= s.expires_at then return s.status; end if;
  if s.grace_period_ends_at is not null and now() <= s.grace_period_ends_at then return 'grace_period'; end if;
  return 'expired';
end; $$;

create or replace function public.school_can_write(target_school uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or public.subscription_effective_status(target_school) in ('trial','active','grace_period');
$$;

create or replace function public.get_current_school_subscription()
returns table(school_id uuid, plan_code text, status public.subscription_status, effective_status public.subscription_status,
  starts_at timestamptz, expires_at timestamptz, grace_period_ends_at timestamptz, offline_licence_expires_at timestamptz)
language sql stable security definer set search_path=public as $$
  select s.school_id,s.plan_code,s.status,public.subscription_effective_status(s.school_id),s.starts_at,s.expires_at,
    s.grace_period_ends_at,s.offline_licence_expires_at
  from public.school_subscriptions s
  where public.belongs_to_school(s.school_id) or public.is_super_admin()
  order by s.updated_at desc limit 1;
$$;

create or replace function public.set_school_subscription(
  p_school_id uuid, p_status public.subscription_status, p_plan_code text,
  p_expires_at timestamptz, p_grace_period_ends_at timestamptz default null,
  p_reason text default null
) returns public.school_subscriptions
language plpgsql security definer set search_path=public as $$
declare old_status public.subscription_status; result public.school_subscriptions;
begin
  if not public.is_super_admin() then raise exception 'Accès réservé à Gabon Éduc+ Service'; end if;
  select status into old_status from public.school_subscriptions where school_id=p_school_id;
  insert into public.school_subscriptions(school_id,status,plan_code,expires_at,grace_period_ends_at,
    suspended_at,suspension_reason,offline_licence_expires_at)
  values(p_school_id,p_status,coalesce(nullif(p_plan_code,''),'pilot'),p_expires_at,p_grace_period_ends_at,
    case when p_status='suspended' then now() else null end,p_reason,
    least(p_expires_at,now()+interval '30 days'))
  on conflict(school_id) do update set status=excluded.status,plan_code=excluded.plan_code,
    expires_at=excluded.expires_at,grace_period_ends_at=excluded.grace_period_ends_at,
    suspended_at=excluded.suspended_at,suspension_reason=excluded.suspension_reason,
    offline_licence_expires_at=excluded.offline_licence_expires_at,updated_at=now()
  returning * into result;
  insert into public.subscription_status_logs(school_id,previous_status,new_status,reason,changed_by)
  values(p_school_id,old_status,p_status,p_reason,auth.uid());
  return result;
end; $$;

create or replace function public.enforce_school_subscription_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_school uuid;
begin
  target_school := case when tg_op='DELETE' then old.school_id else new.school_id end;
  if target_school is not null and not public.school_can_write(target_school) then
    raise exception using errcode='42501', message='ABONNEMENT_REQUIS: écriture suspendue; les données restent consultables.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

do $$
declare table_name text; trigger_name text;
begin
  foreach table_name in array array[
    'platform_workspaces','class_groups','student_records','guardians','guardian_student_links',
    'school_subjects','school_teaching_assignments','timetable_slots','attendance_records','school_announcements',
    'school_documents','school_invitations','school_memberships','academic_years','grading_periods','school_levels','sync_operations'
  ] loop
    if to_regclass('public.'||table_name) is not null then
      trigger_name := 'trg_subscription_guard_'||table_name;
      execute format('drop trigger if exists %I on public.%I',trigger_name,table_name);
      execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.enforce_school_subscription_write()',trigger_name,table_name);
    end if;
  end loop;
end $$;


create or replace function public.enforce_class_subscription_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_class uuid; target_school uuid;
begin
  target_class := case when tg_op='DELETE' then old.class_group_id else new.class_group_id end;
  select school_id into target_school from public.class_groups where id=target_class;
  if target_school is not null and not public.school_can_write(target_school) then
    raise exception using errcode='42501', message='ABONNEMENT_REQUIS: écriture suspendue; les données restent consultables.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

drop trigger if exists trg_subscription_guard_assessments on public.assessments;
create trigger trg_subscription_guard_assessments before insert or update or delete on public.assessments
for each row execute function public.enforce_class_subscription_write();
drop trigger if exists trg_subscription_guard_report_cards on public.report_cards;
create trigger trg_subscription_guard_report_cards before insert or update or delete on public.report_cards
for each row execute function public.enforce_class_subscription_write();

create or replace function public.initialize_school_subscription()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.school_subscriptions(school_id,status,plan_code,expires_at,grace_period_ends_at,offline_licence_expires_at)
  values(new.id,'trial','pilot',now()+interval '30 days',now()+interval '37 days',now()+interval '30 days')
  on conflict(school_id) do nothing;
  return new;
end; $$;
drop trigger if exists trg_initialize_school_subscription on public.schools;
create trigger trg_initialize_school_subscription after insert on public.schools
for each row execute function public.initialize_school_subscription();

alter table public.school_subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.subscription_status_logs enable row level security;
create policy subscriptions_read on public.school_subscriptions for select to authenticated
  using(public.belongs_to_school(school_id) or public.is_super_admin());
create policy subscriptions_manage on public.school_subscriptions for all to authenticated
  using(public.is_super_admin()) with check(public.is_super_admin());
create policy payments_read on public.subscription_payments for select to authenticated
  using(public.has_school_role(school_id,array['school_admin','headmaster']) or public.is_super_admin());
create policy payments_manage on public.subscription_payments for all to authenticated
  using(public.is_super_admin()) with check(public.is_super_admin());
create policy subscription_logs_read on public.subscription_status_logs for select to authenticated
  using(public.has_school_role(school_id,array['school_admin','headmaster']) or public.is_super_admin());
create policy subscription_logs_manage on public.subscription_status_logs for all to authenticated
  using(public.is_super_admin()) with check(public.is_super_admin());

revoke all on function public.subscription_effective_status(uuid) from public;
revoke all on function public.school_can_write(uuid) from public;
revoke all on function public.get_current_school_subscription() from public;
revoke all on function public.set_school_subscription(uuid,public.subscription_status,text,timestamptz,timestamptz,text) from public;
grant execute on function public.subscription_effective_status(uuid) to authenticated;
grant execute on function public.school_can_write(uuid) to authenticated;
grant execute on function public.get_current_school_subscription() to authenticated;
grant execute on function public.set_school_subscription(uuid,public.subscription_status,text,timestamptz,timestamptz,text) to authenticated;

-- Les établissements existants reçoivent une période pilote afin d'éviter un blocage lors de la migration.
insert into public.school_subscriptions(school_id,status,plan_code,expires_at,grace_period_ends_at,offline_licence_expires_at)
select id,'trial','pilot',now()+interval '30 days',now()+interval '37 days',now()+interval '30 days' from public.schools
on conflict(school_id) do nothing;
