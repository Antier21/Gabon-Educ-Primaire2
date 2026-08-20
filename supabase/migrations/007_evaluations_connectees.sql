-- Gabon Éduc+ v0.7.0 — Évaluations complètes et isolées par enseignant
create table if not exists public.teacher_evaluations(
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_group_id uuid references public.class_groups(id) on delete set null,
  title text not null check(char_length(title) between 3 and 160),
  subject text not null,
  grade text not null,
  evaluation_date date not null,
  status public.content_status not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_teacher_evaluations_owner_date on public.teacher_evaluations(teacher_id,evaluation_date desc);
alter table public.teacher_evaluations enable row level security;
drop policy if exists teacher_evaluations_read on public.teacher_evaluations;
drop policy if exists teacher_evaluations_insert on public.teacher_evaluations;
drop policy if exists teacher_evaluations_update on public.teacher_evaluations;
drop policy if exists teacher_evaluations_delete on public.teacher_evaluations;
create policy teacher_evaluations_read on public.teacher_evaluations for select to authenticated using(teacher_id=auth.uid());
create policy teacher_evaluations_insert on public.teacher_evaluations for insert to authenticated with check(teacher_id=auth.uid());
create policy teacher_evaluations_update on public.teacher_evaluations for update to authenticated using(teacher_id=auth.uid()) with check(teacher_id=auth.uid());
create policy teacher_evaluations_delete on public.teacher_evaluations for delete to authenticated using(teacher_id=auth.uid());
drop trigger if exists trg_teacher_evaluations_updated_at on public.teacher_evaluations;
create trigger trg_teacher_evaluations_updated_at before update on public.teacher_evaluations for each row execute function public.set_updated_at();
