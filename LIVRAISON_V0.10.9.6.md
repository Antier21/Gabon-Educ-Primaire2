# Gabon Éduc+ v0.10.9.6 — correction du contexte établissement actif

## Problème reproduit
Un compte pouvant être membre de plusieurs établissements pouvait enregistrer/sélectionner un lycée, puis retomber après connexion sur un ancien établissement primaire. Les formulaires « Créer une classe » affichaient alors CP1–CM2 et les matières du primaire malgré un parcours Lycée public.

## Causes identifiées
1. `AuthForm` effaçait `active-school` lors d’une connexion du compte principal par e-mail.
2. `resolveActiveSchool` privilégiait le `school_id` ancien de `platform_workspaces` avant la sélection explicite récente.
3. Lors d’un changement d’établissement, le payload de l’ancien workspace pouvait être greffé au nouvel établissement avant renormalisation.
4. `ClassesManagerLocal` construisait ses listes Niveau/Matière directement depuis le cache local au rendu, au lieu de résoudre d’abord l’établissement actif depuis Supabase.

## Correctifs
- Conservation de l’établissement actif lors de la connexion par e-mail.
- Validation de cet établissement contre les `school_memberships` Supabase avant toute utilisation.
- Priorité à `activeSchool` sur l’ancien `school_id` de `platform_workspaces`.
- Renormalisation du workspace après résolution de l’établissement réel.
- Préservation du workspace local du nouvel établissement lorsqu’il correspond au `school_id` actif, afin de ne pas importer niveaux/matières/affectations de l’ancien établissement.
- `ClassesManagerLocal` charge désormais `loadPlatformWorkspace()` avant de produire les listes de niveaux et de matières.
- Le bouton « Créer une classe » reste désactivé tant que le contexte établissement n’est pas résolu.

## Résultat métier attendu
- Lycée : 2nde, 1re, Terminale uniquement.
- Collège : 6e, 5e, 4e, 3e uniquement.
- Primaire : CP1, CP2, CE1, CE2, CM1, CM2 uniquement.
- Les matières proposées suivent le type réel de l’établissement actif.

## Migration Supabase
Aucune nouvelle migration. La migration 046 de la v0.10.9.5 reste applicable et assure l’intégrité `school_type` / niveau côté base.

## Fichiers principaux modifiés
- `components/AuthForm.tsx`
- `lib/platform/store.ts`
- `components/ClassesManagerLocal.tsx`
- `package.json`
- `package-lock.json`

## Vérifications
La structure et les modifications ont été inspectées localement. La suite npm complète n’a pas été exécutée dans l’environnement de génération faute de dépendances `node_modules` disponibles localement.
