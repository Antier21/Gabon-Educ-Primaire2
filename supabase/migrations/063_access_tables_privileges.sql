-- Gabon Educ+ Primaire v0.12.0-primary.16
-- Corrige les privilèges SQL manquants constatés pendant les tests d'isolation locale.
-- Les politiques RLS restent actives et continuent de limiter les opérations des utilisateurs authentifiés.

grant select, insert, update, delete on table public.school_memberships to authenticated, service_role;
grant select, insert, update, delete on table public.access_credentials to authenticated, service_role;
grant select, insert, update, delete on table public.profiles to authenticated, service_role;
grant select, insert, update, delete on table public.user_roles to authenticated, service_role;
