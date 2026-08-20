-- Gabon Éduc+ v0.9.0 — index de préproduction
alter table public.attendance_records
  add column if not exists school_id uuid references public.schools(id) on delete cascade,
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null,
  add column if not exists school_period_id uuid references public.school_periods(id) on delete set null,
  add column if not exists class_group_id uuid references public.class_groups(id) on delete set null,
  add column if not exists student_id uuid references public.student_records(id) on delete cascade,
  add column if not exists timetable_slot_id uuid references public.timetable_slots(id) on delete set null,
  add column if not exists attendance_kind text,
  add column if not exists attendance_date date,
  add column if not exists duration_minutes integer not null default 0,
  add column if not exists reason text,
  add column if not exists proof_name text,
  add column if not exists is_justified boolean not null default false;
create index if not exists idx_memberships_user_school_active on public.school_memberships(user_id,school_id,status);
create index if not exists idx_class_groups_school_year on public.class_groups(school_id,academic_year_id,name);
create index if not exists idx_student_records_school_registration on public.student_records(school_id,registration_number) where status='active';
create index if not exists idx_guardian_links_school_student on public.guardian_student_links(school_id,student_id,guardian_id);
create index if not exists idx_assignments_school_teacher_class on public.school_teaching_assignments(school_id,teacher_id,class_group_id,is_active);
create index if not exists idx_assessment_scores_assessment_student on public.assessment_scores(assessment_id,class_student_id,score_status);
create index if not exists idx_report_cards_school_period_status on public.report_cards(school_id,grading_period_id,report_status);
create index if not exists idx_announcements_active on public.school_announcements(school_id,publishes_at,expires_at) where publication_status='published';
create index if not exists idx_attendance_period_student_v09 on public.attendance_records(school_id,school_period_id,student_id,attendance_date);
create index if not exists idx_timetable_room_day on public.timetable_slots(school_id,room,weekday,starts_at,ends_at) where room is not null;
