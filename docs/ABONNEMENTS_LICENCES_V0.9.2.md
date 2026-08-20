# Abonnements et licences — v0.9.2

## Installation
1. Installer normalement la version 0.9.2.
2. Dans Supabase, exécuter la migration `037_v092_subscriptions_licences.sql` après les migrations précédentes.
3. Vérifier que chaque établissement apparaît dans `school_subscriptions` avec le statut `trial`.
4. Attribuer le rôle global `super_admin` au compte propriétaire de GABON Educ+ Service.

## Fonctionnement
- `trial`, `active`, `grace_period` : lecture et écriture autorisées.
- `suspended`, `expired`, `cancelled` : lecture autorisée, créations/modifications/suppressions bloquées en base.
- Les établissements existants reçoivent automatiquement 30 jours de période pilote et 7 jours de grâce.
- Les nouveaux établissements reçoivent la même période automatiquement.
- La console centrale se trouve à `/gabon-educ/service-abonnements` et reste protégée par les règles super-administrateur Supabase.

## Test minimal
1. Ouvrir `/gabon-educ/abonnement` avec un compte d’établissement.
2. Avec le super-administrateur, ouvrir `/gabon-educ/service-abonnements`.
3. Suspendre l’établissement test.
4. Vérifier que les données restent visibles.
5. Essayer de créer ou modifier un élève : Supabase doit répondre `ABONNEMENT_REQUIS`.
6. Réactiver l’établissement pour 30 jours et refaire l’opération.
