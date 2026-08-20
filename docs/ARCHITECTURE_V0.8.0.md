# Architecture v0.8.0

## Principes

L’interface reste organisée par routes Next.js App Router. `components/platform/PlatformManager.tsx` fournit les vues établissement et `lib/platform` contient les types, calculs purs, migration et stockage. `lib/permissions` centralise les droits. Le module historique des classes reste servi par `ClassesManagerLocal`.

## Stockage hybride

Chaque module écrit d’abord dans une clé `localStorage` versionnée `gabon-educ:v0.8:*`. Si Supabase est complètement configuré et authentifié, `platform_workspaces` synchronise une copie JSON. Un délai d’attente fini et un repli local empêchent tout chargement infini. Les tables normalisées 012–022 restent la cible serveur durable.

## Frontières de sécurité

Le mode local simule les rôles uniquement pour les parcours fonctionnels. L’isolation réelle est assurée côté serveur par RLS, `school_id`, les appartenances actives, les périmètres de classe et les affectations enseignantes.

## Calculs

La détection de conflits, les statistiques d’assiduité, les transferts, les contrôles de workflow et les modèles de documents sont des fonctions TypeScript pures dans `lib/platform/calculations.ts`. Les calculs de notes et bulletins restent dans `lib/grading/calculations.ts`.
