# Synchronisation

## Correctif v0.9.1

Toute persistance de plateforme reçoit maintenant explicitement `{ module, operation, entityId, payload, baseUpdatedAt }`. Les modules reconnus sont `classes`, `students`, `guardians`, `announcements`, `evaluations`, `attendance`, `timetables`, `documents`, `lessons`, `grading`, `users`, `subjects`, `assignments` et `settings`. Les opérations sont exclusivement `create`, `update` ou `delete`.

Le transport ne transmet jamais directement une enveloppe comme `{ announcement: {...} }`. `buildSupabaseMutation` la convertit en colonnes SQL (`title`, `content`, `audience`, `publication_status`, `created_by`, etc.). Le même principe est appliqué à chaque module. `settings` est réservé à `platform_workspaces`; utilisateurs, matières et affectations ont leurs propres modules et tables.

Au traitement, l’identité d’origine `local/local-user` n’est jamais envoyée comme UUID. La session Supabase fournit l’utilisateur réel. L’établissement est vérifié dans ses appartenances actives, puis retrouvé dans son workspace ou sa première appartenance active. En l’absence d’établissement requis, l’opération échoue explicitement et reste conservée avec son erreur.

Le mode local affiche « Mode local — synchronisation cloud indisponible ». La file `localStorage` reste intacte après rechargement. Avec Supabase, le centre tente le transport ; un succès devient `synced`, une erreur incrémente `retryCount` jusqu’à cinq et conserve `lastError`.

Chaque mutation possède un identifiant, un module, une entité, une charge utile, une date, une version et un état. La file locale dédoublonne les opérations, passe par `pending`, `syncing`, puis `synced`, `conflict` ou `error`. Les erreurs réseau sont réessayées au maximum cinq fois.

Un conflit conserve les deux versions. L’utilisateur autorisé choisit : garder local, garder cloud ou fusion manuelle. Un bulletin figé n’est jamais fusionné automatiquement. L’annulation et le nettoyage des opérations terminées sont disponibles dans `/gabon-educ/synchronisation`.

### Dédoublonnage

- `create` puis `update` : une seule opération `create`, payload fusionné ;
- plusieurs `update` : une seule opération `update`, payload fusionné ;
- `create` puis `delete` avant envoi : l’opération est retirée ;
- `update` puis `delete` : une seule suppression reste en attente.

### Compatibilité SQL

Les migrations 004 et 019 sont corrigées pour qu’une installation neuve soit cohérente : les RPC de fiches utilisent `profiles.id` et les colonnes établissement d’assiduité sont ajoutées même si la table existe déjà depuis la migration 010. Pour une base v0.9.0 ayant déjà enregistré ces migrations, la migration 031 applique les premières compatibilités. La migration 032 rattache les classes et fiches à l’établissement, crée les dossiers relationnels manquants des élèves, limite les affectations aux enseignants actifs et enregistre les notes dans `assessment_scores`. Les migrations 035 et 036 complètent le registre de notes : résolution des matières par nom ou code, puis réparation d’une ancienne référence de classe via l’élève noté. Les fiches de la file sont écrites dans `lesson_plans` avec résolution de la matière, du niveau et de la classe.
