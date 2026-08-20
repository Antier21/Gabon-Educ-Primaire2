# Livraison — Gabon Éduc+ v0.7.0

## Branche et commits

Branche locale : `codex/v0.7.0-premiere-version-connectee`

- `3fec24a` Prépare architecture stockage hybride et profil
- `bc5d4ed` Synchronise fiches et classes sans perte locale
- `499ae55` Ajoute évaluations programmes et tableau de bord
- `8a82116` Documente et teste la version 0.7.0
- `daf5b67` Consigne la recette des routes principales

## Fichiers ajoutés

- `CHANGELOG.md`
- `components/EvaluationsManager.tsx`
- `components/PasswordResetForm.tsx`
- `components/ProgramsManager.tsx`
- `components/SettingsManager.tsx`
- `components/Workspace.module.css`
- `docs/ARCHITECTURE_V0.7.0.md`
- `docs/SUPABASE.md`
- `docs/TESTS_V0.7.0.md`
- `lib/class-store.ts` et son test
- `lib/evaluation-store.ts` et son test
- `lib/lesson-store.test.ts`
- `lib/classes/validation.test.ts`
- `lib/profile-store.ts`
- `lib/program-store.ts`
- `lib/storage-mode.ts` et son test
- `supabase/migrations/006_profils_classes_connectes.sql`
- `supabase/migrations/007_evaluations_connectees.sql`
- `supabase/migrations/008_indexation_programmes.sql`
- `vitest.config.ts`

## Fichiers modifiés

- workflow GitHub Actions, `package.json` et `package-lock.json` ;
- `README.md`, `ROADMAP.md` et `app/globals.css` ;
- pages Évaluations, Assistant, Mot de passe oublié, Paramètres et Programmes APC ;
- `AICourseGenerator`, `AuthForm`, `ClassesManagerLocal`, `DashboardClient`, `LessonPlanBuilder`, `LessonSyncBridge` et `LessonsManager` ;
- `ClassesManager.module.css`, `lib/lesson-store.ts`, `middleware.ts` et le cache TypeScript suivi par la base.

## Migrations Supabase

La version conserve les migrations `001` à `005` sans modification et ajoute `006`, `007` et `008`. L’ordre complet est documenté dans `docs/SUPABASE.md`.

## Résultats

- `npm test` : 5 fichiers, 13 tests réussis ;
- `npm run lint` : réussi sans erreur ;
- `npm run typecheck` : réussi sans erreur ;
- `npm run build` : compilation réussie, 16 pages générées ;
- recette HTTP : 11 routes principales ont répondu `200` en mode démonstration.

## Limites et actions manuelles

La connexion distante et l’isolation RLS n’ont pas pu être testées sans projet Supabase réel. Il faut créer le projet, exécuter les migrations dans l’ordre, configurer les deux variables publiques, enregistrer les URL de redirection et réaliser le test avec deux enseignants décrit dans `docs/SUPABASE.md`.

L’impression/PDF dépend de la boîte d’impression du navigateur. Les progressions locales sont des exemples non officiels. Aucune API IA externe ni paiement n’est intégré.

Le protocole utilisateur complet et les risques sont fournis dans `docs/TESTS_V0.7.0.md`.
