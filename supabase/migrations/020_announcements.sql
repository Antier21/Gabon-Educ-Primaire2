-- Gabon Éduc+ v0.8.0 — annonces ciblées et publication
create table if not exists public.school_announcements(
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,content text not null,audience text not null check(audience in ('school','teachers','guardians','students','class','group','user')),
  target_id uuid,attachment_name text,publishes_at timestamptz,expires_at timestamptz,
  publication_status text not null default 'draft' check(publication_status in ('draft','published','archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists idx_announcements_school_publication on public.school_announcements(school_id,publication_status,publishes_at desc);
alter table public.school_announcements enable row level security;
create policy announcements_member_read on public.school_announcements for select to authenticated using(public.belongs_to_school(school_id) and (publication_status='published' or created_by=auth.uid() or public.has_school_role(school_id,array['school_admin','headmaster','secretary'])));
create policy announcements_authorized_insert on public.school_announcements for insert to authenticated with check(created_by=auth.uid() and public.has_school_role(school_id,array['school_admin','headmaster','secretary','academic_director']));
create policy announcements_authorized_update on public.school_announcements for update to authenticated using(created_by=auth.uid() or public.has_school_role(school_id,array['school_admin','headmaster'])) with check(created_by=auth.uid() or public.has_school_role(school_id,array['school_admin','headmaster']));
create policy announcements_admin_delete on public.school_announcements for delete to authenticated using(public.has_school_role(school_id,array['school_admin','headmaster']));
drop trigger if exists trg_school_announcements_updated_at on public.school_announcements;create trigger trg_school_announcements_updated_at before update on public.school_announcements for each row execute function public.set_updated_at();
