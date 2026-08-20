# Gabon Educ+ Primaire — v0.12.0-primary.16

Version de référence préparée après les tests d'isolation locale A/B.

## Corrections intégrées

- compatibilité serveur avec `SUPABASE_SECRET_KEY` et l'ancien `SUPABASE_SERVICE_ROLE_KEY` ;
- maintien de la redirection super-admin vers le service abonnements ;
- migration `063_access_tables_privileges.sql` pour rendre persistants les privilèges validés pendant les tests sur :
  - `school_memberships` ;
  - `access_credentials` ;
  - `profiles` ;
  - `user_roles` ;
- suppression du journal temporaire `ADMIN KEY TYPE`.

## Sécurité

Les privilèges SQL n'annulent pas les politiques RLS. Les utilisateurs `authenticated` restent limités par les politiques RLS existantes. La clé `SUPABASE_SECRET_KEY` doit rester exclusivement côté serveur et ne doit jamais être placée dans une variable `NEXT_PUBLIC_*`.

## Déploiement

Appliquer la migration 063 sur le projet Supabase cible avant de tester la création des comptes pédagogiques.
