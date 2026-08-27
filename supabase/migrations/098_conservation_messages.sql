-- Gabon Éduc+ — Conservation et suppression des messages
--
-- Chaque établissement choisit la durée par niveau d'importance. Une durée
-- nulle signifie « conservation jusqu'à suppression manuelle ».

create table if not exists public.message_retention_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  auto_delete_enabled boolean not null default true,
  normal_days integer check (normal_days between 1 and 3650),
  important_days integer check (important_days between 1 and 3650),
  urgent_days integer check (urgent_days between 1 and 3650),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.message_campaigns add column if not exists expires_at timestamptz;
alter table public.message_recipients add column if not exists expires_at timestamptz;
alter table public.message_recipients add column if not exists hidden_at timestamptz;

alter table public.message_retention_settings enable row level security;

drop policy if exists message_retention_settings_staff_read on public.message_retention_settings;
create policy message_retention_settings_staff_read on public.message_retention_settings
  for select to authenticated
  using (public.belongs_to_school(school_id) or public.is_super_admin());

drop policy if exists message_retention_settings_staff_write on public.message_retention_settings;
create policy message_retention_settings_staff_write on public.message_retention_settings
  for all to authenticated
  using (public.can_send_school_message(school_id))
  with check (public.can_send_school_message(school_id));

drop trigger if exists trg_message_retention_settings_updated_at on public.message_retention_settings;
create trigger trg_message_retention_settings_updated_at
before update on public.message_retention_settings
for each row execute function public.set_updated_at();

create or replace function public.message_expiry_for(
  target_school uuid,
  message_priority text,
  starting_at timestamptz
)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not coalesce(settings.auto_delete_enabled, true) then null
    when message_priority = 'urgent' then
      case when settings.urgent_days is null then null
           else starting_at + make_interval(days => settings.urgent_days) end
    when message_priority = 'important' then
      case when settings.important_days is null then null
           else starting_at + make_interval(days => settings.important_days) end
    else
      case when settings.normal_days is null then null
           else starting_at + make_interval(days => settings.normal_days) end
  end
  from (
    select
      coalesce((select auto_delete_enabled from public.message_retention_settings where school_id = target_school), true) as auto_delete_enabled,
      (select normal_days from public.message_retention_settings where school_id = target_school) as normal_days,
      (select important_days from public.message_retention_settings where school_id = target_school) as important_days,
      (select urgent_days from public.message_retention_settings where school_id = target_school) as urgent_days
  ) settings;
$$;

create or replace function public.set_message_campaign_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.channel = 'internal' and new.expires_at is null then
    new.expires_at := public.message_expiry_for(
      new.school_id,
      coalesce(new.priority, 'normal'),
      coalesce(new.created_at, now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_message_campaign_expiry on public.message_campaigns;
create trigger trg_message_campaign_expiry
before insert or update of priority, created_at on public.message_campaigns
for each row execute function public.set_message_campaign_expiry();

create or replace function public.refresh_message_expiry_after_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message_campaigns campaign
  set expires_at = public.message_expiry_for(
    new.school_id,
    coalesce(campaign.priority, 'normal'),
    campaign.created_at
  )
  where campaign.school_id = new.school_id
    and campaign.channel = 'internal';

  update public.message_recipients recipient
  set expires_at = campaign.expires_at
  from public.message_campaigns campaign
  where campaign.id = recipient.campaign_id
    and campaign.school_id = new.school_id;
  return new;
end;
$$;

drop trigger if exists trg_refresh_message_expiry_after_settings on public.message_retention_settings;
create trigger trg_refresh_message_expiry_after_settings
after insert or update of auto_delete_enabled, normal_days, important_days, urgent_days
on public.message_retention_settings
for each row execute function public.refresh_message_expiry_after_settings();

create or replace function public.set_message_recipient_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.expires_at is null then
    select campaign.expires_at into new.expires_at
    from public.message_campaigns campaign
    where campaign.id = new.campaign_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_message_recipient_expiry on public.message_recipients;
create trigger trg_message_recipient_expiry
before insert on public.message_recipients
for each row execute function public.set_message_recipient_expiry();

-- Les campagnes déjà présentes reçoivent la règle actuelle de leur école.
update public.message_campaigns campaign
set expires_at = public.message_expiry_for(
  campaign.school_id,
  coalesce(campaign.priority, 'normal'),
  campaign.created_at
)
where campaign.channel = 'internal';

update public.message_recipients recipient
set expires_at = campaign.expires_at
from public.message_campaigns campaign
where campaign.id = recipient.campaign_id;

create index if not exists idx_message_campaigns_expiry
  on public.message_campaigns(expires_at) where expires_at is not null;
create index if not exists idx_message_recipients_guardian_visible
  on public.message_recipients(guardian_id, created_at desc) where hidden_at is null;

create or replace function public.purge_expired_message_campaigns()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  delete from public.message_campaigns
  where expires_at is not null and expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_expired_message_campaigns() from public;
grant execute on function public.purge_expired_message_campaigns() to service_role;

create or replace function public.purge_school_expired_messages(p_school_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  if not public.can_send_school_message(p_school_id) then
    raise exception 'Ce compte ne peut pas nettoyer les messages de cet établissement.'
      using errcode = '42501';
  end if;
  delete from public.message_campaigns
  where school_id = p_school_id
    and expires_at is not null
    and expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.delete_school_message_campaign(p_campaign_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare target_school uuid;
begin
  select school_id into target_school
  from public.message_campaigns where id = p_campaign_id;
  if target_school is null or not public.can_send_school_message(target_school) then
    raise exception 'Suppression non autorisée.' using errcode = '42501';
  end if;
  delete from public.message_campaigns where id = p_campaign_id;
  return found;
end;
$$;

create or replace function public.hide_my_parent_message(p_recipient_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message_recipients recipient
  set hidden_at = coalesce(recipient.hidden_at, now())
  where recipient.id = p_recipient_id
    and public.is_own_message_recipient(recipient.guardian_id);
  return found;
end;
$$;

revoke all on function public.purge_school_expired_messages(uuid) from public;
revoke all on function public.delete_school_message_campaign(uuid) from public;
revoke all on function public.hide_my_parent_message(uuid) from public;
grant execute on function public.purge_school_expired_messages(uuid) to authenticated;
grant execute on function public.delete_school_message_campaign(uuid) to authenticated;
grant execute on function public.hide_my_parent_message(uuid) to authenticated;

-- Si pg_cron est déjà activé dans Supabase, nettoyage nocturne. Dans le cas
-- contraire, l'application lance aussi ce nettoyage à chaque ouverture du
-- journal administratif : l'automatisme reste donc effectif.
do $$
declare existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select jobid from cron.job where jobname = $1 limit 1'
      into existing_job using 'gabon-educ-message-retention';
    if existing_job is null then
      perform cron.schedule(
        'gabon-educ-message-retention',
        '17 2 * * *',
        'select public.purge_expired_message_campaigns()'
      );
    end if;
  end if;
exception
  when undefined_table or insufficient_privilege then
    raise notice 'pg_cron indisponible : nettoyage déclenché par l''application.';
end;
$$;

notify pgrst, 'reload schema';
