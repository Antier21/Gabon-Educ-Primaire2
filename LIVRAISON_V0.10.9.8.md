# Gabon Éduc+ v0.10.9.8 — restauration RPC d’enregistrement établissement

## Problème confirmé
Le formulaire d’onboarding appelle `public.register_school_from_onboarding`, mais Supabase renvoie `PGRST202` car cette fonction n’est pas présente dans le cache de schéma / la base.

La fonction existait dans l’ancienne migration `042_v0102_establishment_onboarding_flow.sql`, mais cette migration n’a manifestement pas été appliquée sur la base utilisée pour les tests.

## Correction
Ajout d’une migration ciblée :
`supabase/migrations/047_v01098_restore_onboarding_rpc.sql`

Elle recrée uniquement :
- `default_school_level_codes(text)` ;
- `level_cycle_from_code(text)` ;
- `register_school_from_onboarding(...)`.

La RPC crée :
- l’établissement ;
- les memberships `headmaster` et `school_admin` ;
- l’année scolaire ;
- les trois trimestres ;
- les niveaux compatibles avec le type d’établissement.

Elle ne rejoue pas l’ensemble de la migration 042, afin de ne pas écraser les correctifs 045/046 déjà appliqués.

## Diagnostic interface
Le formulaire affiche désormais un message explicite si Supabase renvoie `PGRST202`.

## Test attendu
Après exécution de la migration 047 dans Supabase, créer un établissement depuis l’onboarding. La requête `register_school_from_onboarding` doit retourner 200 et un UUID d’établissement.
