# Livraison Gabon Éduc+ v0.9.1

Correctif de synchronisation métier appliqué exclusivement à la v0.9.0 officielle.

## Modules reliés

- `classes` : création, modification, suppression ;
- `students` : création, modification, archivage et suppression ;
- `guardians` : création depuis l’écran et les imports ;
- `announcements` : création et publication ;
- `evaluations` : création, modification et suppression ;
- `attendance` : création et import ;
- `timetables` : création et import ;
- `documents` : génération ;
- `lessons` : création, modification et suppression ;
- `grading` : notes, évaluations du registre, snapshots, publication et réouverture ;
- `users` : invitations et changements d’état vers `school_invitations` ;
- `subjects` : matières vers `school_subjects` ;
- `assignments` : affectations vers `school_teaching_assignments` ;
- `settings` : uniquement le workspace global vers `platform_workspaces`.

## Correctifs techniques

- métadonnées strictes obligatoires pour `savePlatformWorkspace` ;
- dédoublonnage métier cohérent ;
- file locale persistante et message explicite sans Supabase ;
- centre de synchronisation entièrement libellé en français ;
- formulaires `AnnouncementsView`, `AttendanceView`, `UsersView` et tous les autres cas détectés sécurisés autour des `await` ;
- `PlatformManager.tsx` formaté sur plus de 2 000 lignes lisibles.
- transport Supabase fondé sur une correspondance explicite des colonnes SQL ;
- résolution de l’utilisateur authentifié et d’un établissement actif avant écriture ;
- migration 031 corrigeant les contraintes historiques d’assiduité et les RPC de fiches pédagogiques.
- migration 032 corrigeant les rattachements établissement/classe, l’unification des élèves, les enseignants acceptés et les notes relationnelles ;
- conversion du rôle applicatif `guardian` vers le rôle SQL `parent` ;
- clôture des opérations `grading` et `settings` après une écriture directe réussie, sans faux conflit de version ;
- validation des coefficients strictement positifs avant écriture Supabase.

## Limites

- les actions de modification/suppression ne sont reliées que lorsqu’elles existent dans l’interface actuelle ;
- la validation Supabase distante, multi-utilisateurs et RLS exige toujours une instance de préproduction configurée ;
- les migrations 004 et 019 ont été corrigées pour les installations neuves ; les migrations séquentielles 031 et 032 appliquent les compatibilités et réparations aux bases existantes.

## Contrôles exécutés

- `npm install` : réussi, dépendances à jour ;
- `npm run typecheck` : réussi, 0 erreur TypeScript ;
- `npm run lint` : réussi, 0 erreur et 0 avertissement ESLint ;
- `npm run test` : 25 fichiers réussis, 137 tests réussis sur 137 ;
- `npm run build` : réussi, compilation de production et 35 pages statiques générées.

Les 102 tests v0.9.0 sont conservés et 35 tests de correctif sont présents.
