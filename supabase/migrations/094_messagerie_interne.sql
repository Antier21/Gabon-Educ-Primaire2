-- Gabon Éduc+ — Messagerie interne sécurisée vers les parents
--
-- Cette migration conserve les campagnes WhatsApp historiques, mais fait de
-- l'espace parent le canal principal. Une ligne par responsable et par élève
-- garantit que les destinataires ne voient jamais les autres familles.

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  category text not null default 'general',
  body text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists public.message_campaigns (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  body text not null,
  channel text not null default 'internal',
  audience_kind text not null default 'class',
  class_group_id uuid references public.class_groups(id) on delete set null,
  level_code text,
  status text not null default 'sent',
  publish_to_parent_space boolean not null default true,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  priority text not null default 'normal',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.message_campaigns(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  student_id uuid not null references public.student_records(id) on delete cascade,
  guardian_name text not null default '',
  student_name text not null default '',
  class_name text not null default '',
  phone text not null default '',
  resolved_body text not null default '',
  status text not null default 'sent',
  failure_reason text,
  sent_at timestamptz,
  sent_channel text,
  delivered_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

-- Colonnes ajoutées aussi aux bases où les tables existaient avant le dépôt.
alter table public.message_campaigns add column if not exists priority text not null default 'normal';
alter table public.message_campaigns add column if not exists publish_to_parent_space boolean not null default true;
alter table public.message_recipients add column if not exists delivered_at timestamptz;
alter table public.message_recipients add column if not exists read_at timestamptz;
alter table public.message_recipients add column if not exists acknowledged_at timestamptz;
alter table public.message_recipients add column if not exists sent_channel text;

alter table public.message_campaigns drop constraint if exists message_campaigns_channel_check;
alter table public.message_campaigns add constraint message_campaigns_channel_check
  check (channel in ('internal', 'whatsapp', 'multichannel'));
alter table public.message_campaigns drop constraint if exists message_campaigns_audience_kind_check;
alter table public.message_campaigns add constraint message_campaigns_audience_kind_check
  check (audience_kind in ('school', 'class', 'level', 'students'));
alter table public.message_campaigns drop constraint if exists message_campaigns_priority_check;
alter table public.message_campaigns add constraint message_campaigns_priority_check
  check (priority in ('normal', 'important', 'urgent'));
alter table public.message_recipients drop constraint if exists message_recipients_sent_channel_check;
alter table public.message_recipients add constraint message_recipients_sent_channel_check
  check (sent_channel is null or sent_channel in ('internal', 'whatsapp', 'sms', 'manual', 'group'));

create index if not exists idx_message_campaigns_school_created
  on public.message_campaigns(school_id, created_at desc);
create index if not exists idx_message_recipients_campaign
  on public.message_recipients(campaign_id);
create index if not exists idx_message_recipients_guardian_unread
  on public.message_recipients(guardian_id, created_at desc) where read_at is null;

-- Ces fonctions s'exécutent hors RLS afin d'éviter une récursion entre une
-- campagne et ses destinataires. Elles ne retournent aucune donnée privée.
create or replace function public.is_own_message_recipient(target_guardian uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guardians g
    where g.id = target_guardian and g.profile_id = auth.uid()
  );
$$;

create or replace function public.can_read_parent_campaign(target_campaign uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.message_recipients mr
    join public.guardians g on g.id = mr.guardian_id
    where mr.campaign_id = target_campaign and g.profile_id = auth.uid()
  );
$$;

-- Le parent ne reçoit pas UPDATE sur la table : il passe par ces fonctions,
-- qui ne peuvent modifier que les accusés de son propre compte.
create or replace function public.mark_my_parent_messages_read(target_recipient_ids uuid[])
returns integer language plpgsql security definer
set search_path = public
as $$
declare changed integer;
begin
  update public.message_recipients mr
  set read_at = coalesce(mr.read_at, now())
  where mr.id = any(target_recipient_ids)
    and public.is_own_message_recipient(mr.guardian_id)
    and mr.read_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.acknowledge_my_parent_message(target_recipient_id uuid)
returns boolean language plpgsql security definer
set search_path = public
as $$
begin
  update public.message_recipients mr
  set read_at = coalesce(mr.read_at, now()),
      acknowledged_at = coalesce(mr.acknowledged_at, now())
  where mr.id = target_recipient_id
    and public.is_own_message_recipient(mr.guardian_id);
  return found;
end;
$$;

revoke all on function public.mark_my_parent_messages_read(uuid[]) from public;
revoke all on function public.acknowledge_my_parent_message(uuid) from public;
grant execute on function public.mark_my_parent_messages_read(uuid[]) to authenticated;
grant execute on function public.acknowledge_my_parent_message(uuid) to authenticated;

alter table public.message_templates enable row level security;
alter table public.message_campaigns enable row level security;
alter table public.message_recipients enable row level security;

drop policy if exists message_templates_staff_read on public.message_templates;
create policy message_templates_staff_read on public.message_templates
  for select to authenticated using (public.belongs_to_school(school_id));
drop policy if exists message_templates_staff_write on public.message_templates;
create policy message_templates_staff_write on public.message_templates
  for all to authenticated
  using (public.has_school_role(school_id, array['school_admin','headmaster','secretary','academic_director']))
  with check (public.has_school_role(school_id, array['school_admin','headmaster','secretary','academic_director']));

drop policy if exists message_campaigns_staff_read on public.message_campaigns;
create policy message_campaigns_staff_read on public.message_campaigns
  for select to authenticated using (public.belongs_to_school(school_id));
drop policy if exists message_campaigns_parent_read on public.message_campaigns;
create policy message_campaigns_parent_read on public.message_campaigns
  for select to authenticated using (public.can_read_parent_campaign(id));
drop policy if exists message_campaigns_staff_write on public.message_campaigns;
create policy message_campaigns_staff_write on public.message_campaigns
  for all to authenticated
  using (public.has_school_role(school_id, array['school_admin','headmaster','secretary','academic_director']))
  with check (public.has_school_role(school_id, array['school_admin','headmaster','secretary','academic_director']));

drop policy if exists message_recipients_staff_read on public.message_recipients;
create policy message_recipients_staff_read on public.message_recipients
  for select to authenticated using (public.belongs_to_school(school_id));
drop policy if exists message_recipients_parent_read on public.message_recipients;
create policy message_recipients_parent_read on public.message_recipients
  for select to authenticated using (public.is_own_message_recipient(guardian_id));
drop policy if exists message_recipients_staff_write on public.message_recipients;
create policy message_recipients_staff_write on public.message_recipients
  for all to authenticated
  using (public.has_school_role(school_id, array['school_admin','headmaster','secretary','academic_director']))
  with check (public.has_school_role(school_id, array['school_admin','headmaster','secretary','academic_director']));

drop trigger if exists trg_message_templates_updated_at on public.message_templates;
create trigger trg_message_templates_updated_at before update on public.message_templates
for each row execute function public.set_updated_at();
drop trigger if exists trg_message_campaigns_updated_at on public.message_campaigns;
create trigger trg_message_campaigns_updated_at before update on public.message_campaigns
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
