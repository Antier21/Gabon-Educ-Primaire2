# Gabon Educ+ v0.10.9 — Connexion par identifiant et mot de passe

Base de départ : v0.10.8-passerelle-cahiers-apc.

## Objectif

Avant le déploiement, les utilisateurs ne se connectent plus par adresse e-mail personnelle. L'e-mail reste réservé au compte responsable de l'établissement. Les accès courants sont gérés par identifiant/code d'accès + mot de passe.

## Ajouts principaux

- Connexion par identifiant ou code d'accès dans les pages de connexion.
- Le compte établissement peut encore utiliser son e-mail dans le même champ.
- Table Supabase `access_credentials`.
- API serveur pour créer les comptes utilisateurs sans exposer la clé service_role au navigateur.
- Onglet Utilisateurs : création d'un identifiant et d'un mot de passe provisoire.
- Support de `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Migration à exécuter

Exécuter dans Supabase SQL Editor :

`supabase/migrations/043_v0109_identifiants_codes_acces.sql`

## Variable serveur obligatoire pour le déploiement

Dans Netlify, ajouter :

`SUPABASE_SERVICE_ROLE_KEY=...`

Cette clé ne doit jamais être placée dans le code ni dans le navigateur.

## Test rapide

1. Se connecter avec le compte établissement.
2. Aller dans Administration → Utilisateurs.
3. Créer un accès enseignant avec identifiant + mot de passe provisoire.
4. Se déconnecter.
5. Aller dans Espace Professeurs.
6. Se connecter avec l'identifiant créé et le mot de passe provisoire.
