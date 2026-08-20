-- Gabon Éduc+ v0.9.0 — notifications internes
create table if not exists public.internal_notifications(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,notification_kind text not null,title text not null,message text not null,
  target_path text,read_at timestamptz,created_by uuid references public.profiles(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_unread on public.internal_notifications(user_id,read_at,created_at desc);
create index if not exists idx_notifications_school_kind on public.internal_notifications(school_id,notification_kind,created_at desc);
alter table public.internal_notifications enable row level security;
create policy notifications_owner_read on public.internal_notifications for select to authenticated using(user_id=auth.uid());
create policy notifications_authorized_insert on public.internal_notifications for insert to authenticated with check(created_by=auth.uid() and public.belongs_to_school(school_id));
create policy notifications_owner_update on public.internal_notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy notifications_owner_delete on public.internal_notifications for delete to authenticated using(user_id=auth.uid());
drop trigger if exists trg_internal_notifications_updated_at on public.internal_notifications;create trigger trg_internal_notifications_updated_at before update on public.internal_notifications for each row execute function public.set_updated_at();
