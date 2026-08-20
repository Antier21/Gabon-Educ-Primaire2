-- Gabon Éduc+ v0.9.0 — file de synchronisation et conflits explicites
create table if not exists public.sync_operations(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,module text not null,operation_type text not null check(operation_type in ('create','update','delete')),
  entity_id uuid not null,payload jsonb not null default '{}'::jsonb,base_updated_at timestamptz,retry_count smallint not null default 0 check(retry_count between 0 and 5),
  last_error text,sync_status text not null default 'pending' check(sync_status in ('pending','syncing','synced','conflict','error','cancelled')),
  remote_payload jsonb,remote_updated_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,module,entity_id,sync_status)
);
create index if not exists idx_sync_operations_user_status on public.sync_operations(user_id,sync_status,created_at);
create index if not exists idx_sync_operations_school_module on public.sync_operations(school_id,module,entity_id);
alter table public.sync_operations enable row level security;
create policy sync_operations_owner_read on public.sync_operations for select to authenticated using(user_id=auth.uid() or public.has_school_role(school_id,array['school_admin','headmaster']));
create policy sync_operations_owner_insert on public.sync_operations for insert to authenticated with check(user_id=auth.uid() and public.belongs_to_school(school_id));
create policy sync_operations_owner_update on public.sync_operations for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and public.belongs_to_school(school_id));
create policy sync_operations_owner_delete on public.sync_operations for delete to authenticated using(user_id=auth.uid() and sync_status in ('synced','cancelled'));
drop trigger if exists trg_sync_operations_updated_at on public.sync_operations;create trigger trg_sync_operations_updated_at before update on public.sync_operations for each row execute function public.set_updated_at();
