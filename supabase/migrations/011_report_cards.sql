-- Gabon Éduc+ v0.7.0 — Bulletins, appréciations, validation et snapshots
create table if not exists public.report_cards(
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_group_id uuid not null references public.class_groups(id) on delete cascade,
  class_student_id uuid not null references public.class_students(id) on delete cascade,
  grading_period_id uuid not null references public.grading_periods(id) on delete cascade,
  report_status text not null default 'draft' check(report_status in ('draft','calculated','review','validated','locked','published')),
  general_average numeric(8,3),
  general_rank integer,
  class_average numeric(8,3),
  snapshot jsonb,
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  locked_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_student_id,grading_period_id),
  check(report_status not in ('locked','published') or snapshot is not null)
);

create table if not exists public.report_card_subjects(
  id uuid primary key default gen_random_uuid(),
  report_card_id uuid not null references public.report_cards(id) on delete cascade,
  class_subject_id uuid references public.class_subjects(id) on delete set null,
  subject_name text not null,
  average_value numeric(8,3),
  coefficient numeric(8,3) not null check(coefficient > 0),
  weighted_value numeric(10,3),
  class_average numeric(8,3),
  subject_rank integer,
  assessment_count integer not null default 0,
  appreciation text,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_card_comments(
  id uuid primary key default gen_random_uuid(),
  report_card_id uuid not null unique references public.report_cards(id) on delete cascade,
  general_comment text,
  work_comment text,
  conduct_comment text,
  council_decision text,
  mention text check(mention is null or mention in ('Encouragements','Tableau d’honneur','Félicitations','Avertissement travail','Avertissement conduite')),
  absence_count integer not null default 0 check(absence_count >= 0),
  late_count integer not null default 0 check(late_count >= 0),
  prepared_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_report_cards_class_period on public.report_cards(class_group_id,grading_period_id,report_status);
create index if not exists idx_report_cards_student on public.report_cards(class_student_id,grading_period_id);
create index if not exists idx_report_subjects_report on public.report_card_subjects(report_card_id);

alter table public.report_cards enable row level security;
alter table public.report_card_subjects enable row level security;
alter table public.report_card_comments enable row level security;

create policy report_cards_owner_read on public.report_cards for select to authenticated using(owner_teacher_id=auth.uid() or public.is_super_admin());
create policy report_cards_owner_write on public.report_cards for all to authenticated
  using(owner_teacher_id=auth.uid() or public.is_super_admin())
  with check((owner_teacher_id=auth.uid() or public.is_super_admin()) and (report_status in ('draft','calculated','review') or public.can_manage_grading_lock()));
create policy report_subjects_owner_all on public.report_card_subjects for all to authenticated using(exists(select 1 from public.report_cards r where r.id=report_card_id and (r.owner_teacher_id=auth.uid() or public.is_super_admin()))) with check(exists(select 1 from public.report_cards r where r.id=report_card_id and (r.owner_teacher_id=auth.uid() or public.is_super_admin())));
create policy report_comments_owner_all on public.report_card_comments for all to authenticated using(exists(select 1 from public.report_cards r where r.id=report_card_id and (r.owner_teacher_id=auth.uid() or public.is_super_admin()))) with check(exists(select 1 from public.report_cards r where r.id=report_card_id and (r.owner_teacher_id=auth.uid() or public.is_super_admin())));

create or replace function public.preserve_locked_report_snapshot()
returns trigger language plpgsql as $$
begin
  if old.report_status='locked' and (new.snapshot is distinct from old.snapshot or new.general_average is distinct from old.general_average) then
    raise exception 'Le snapshot d''un bulletin verrouillé ne peut pas être modifié.';
  end if;
  return new;
end;
$$;

create or replace function public.restrict_report_validation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.report_status is distinct from old.report_status
     and new.report_status in ('validated','locked','published')
     and not public.can_manage_grading_lock() then
    raise exception 'Ce rôle ne peut pas valider, verrouiller ou publier un bulletin.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_preserve_locked_report_snapshot on public.report_cards;
create trigger trg_preserve_locked_report_snapshot before update on public.report_cards for each row execute function public.preserve_locked_report_snapshot();
drop trigger if exists trg_restrict_report_validation on public.report_cards;
create trigger trg_restrict_report_validation before update on public.report_cards for each row execute function public.restrict_report_validation();

drop trigger if exists trg_report_cards_updated_at on public.report_cards;
create trigger trg_report_cards_updated_at before update on public.report_cards for each row execute function public.set_updated_at();
drop trigger if exists trg_report_card_subjects_updated_at on public.report_card_subjects;
create trigger trg_report_card_subjects_updated_at before update on public.report_card_subjects for each row execute function public.set_updated_at();
drop trigger if exists trg_report_card_comments_updated_at on public.report_card_comments;
create trigger trg_report_card_comments_updated_at before update on public.report_card_comments for each row execute function public.set_updated_at();
