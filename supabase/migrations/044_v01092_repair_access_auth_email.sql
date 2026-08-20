-- Gabon Éduc+ v0.10.9.2 — Réparation des accès créés avant le changement de domaine technique.
-- Aligne access_credentials.auth_email sur l'e-mail réellement porté par auth.users.

update public.access_credentials ac
set auth_email = lower(u.email),
    updated_at = now()
from auth.users u
where u.id = ac.auth_user_id
  and u.email is not null
  and lower(ac.auth_email) <> lower(u.email);
