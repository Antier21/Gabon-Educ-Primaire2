-- Gabon Éduc+ v0.7.0 — Indexation de la consultation des programmes APC
create index if not exists idx_weekly_progressions_curriculum_week on public.weekly_progressions(curriculum_id,week_number);
create index if not exists idx_curricula_subject_grade_status on public.curricula(subject_id,grade_level_id,status);
