# Gabon Éduc+ v0.10.9.5 — intégrité établissements / niveaux / classes

## Problèmes corrigés
- Les classes de plusieurs établissements étaient chargées sans filtre `school_id` dans `class-store`, ce qui expliquait les listes mélangeant primaire, collège et lycée.
- Les anciennes classes locales sans établissement propriétaire pouvaient contaminer l’établissement actif.
- Les niveaux étaient filtrés mais pas normalisés/dédupliqués de façon centrale.
- Le formulaire d’inscription lisait les classes locales sans revalider leur établissement.
- Les évaluations utilisaient une liste secondaire globale collège + lycée.

## Règles appliquées
- Primaire : CP1, CP2, CE1, CE2, CM1, CM2.
- Collège : 6e, 5e, 4e, 3e.
- Lycée : 2nde, 1re, Terminale.
- Complexe scolaire : les trois cycles, tout en conservant la notion de cycle.
- Supabase est la source d’autorité pour l’établissement actif.
- Une classe est toujours reliée à un `school_id` et doit avoir un niveau compatible avec le type d’établissement.

## Fichiers principaux modifiés
- `lib/school-profiles.ts`
- `lib/class-store.ts`
- `components/StudentEnrollmentManager.tsx`
- `components/EvaluationsManager.tsx`
- `supabase/migrations/046_v01095_school_level_integrity.sql`
- `lib/school-profiles.test.ts`

## Migration
Exécuter `046_v01095_school_level_integrity.sql` après les migrations précédentes. Elle ajoute un contrôle SQL empêchant la création ou la modification d’une classe avec un niveau incompatible avec le type d’établissement.

## Vérifications techniques
- Contrôle statique des fichiers modifiés et de la structure de l’archive effectué.
- `npm install` n’a pas pu aboutir dans l’environnement de génération : le registre npm interne renvoie 404 pour `yocto-queue@0.1.0`.
- En conséquence, `npm test`, `npm run typecheck` et `npm run build` n’ont pas pu être validés avec les dépendances installées dans cet environnement. Ne pas interpréter cela comme un succès de ces commandes.
