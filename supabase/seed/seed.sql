-- Données de démonstration facultatives.
-- Les niveaux, matières et formules d'abonnement sont déjà insérés
-- par la migration 001_schema_initial.sql.

-- Exemple d'année scolaire : à adapter avant utilisation.
insert into public.academic_years (label, starts_on, ends_on, is_current)
values ('2026-2027', '2026-09-01', '2027-07-31', true)
on conflict (label) do nothing;
