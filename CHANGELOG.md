## v0.12.0-primary.4 — correctif de compilation

- Suppression de la propriété `CP1` dupliquée dans les alias des bulletins primaires.

## v0.12.0-primary.3 — cinq années du primaire gabonais

- Limitation de l'édition Primaire aux niveaux 1ère, 2e, 3e, 4e et 5e Année.
- Retrait de « 6e Année » des listes, formulaires et documents.
- Compatibilité maintenue avec les anciennes appellations CP, CE1, CE2, CM1 et CM2.

## v0.12.0-primary.2 — séparation des ressources secondaires

- Retrait de la passerelle et des ressources « Les Cahiers APC », réservées à Gabon Éduc+ Secondaire.
- Conservation des outils généraux de gestion pédagogique APC adaptés à l’école primaire.

## v0.10.7 — correctifs Pronote, DOCX et boutons d’action

- Samedi ajouté aux emplois du temps.
- Relevé de notes synchronisé avec les évaluations.
- Bulletins connectés aux snapshots du registre de notes.
- Export DOCX modifiable pour les évaluations.
- Actions Enregistrer / Modifier / Annuler / Imprimer uniformisées dans les modules clés.

## v0.9.8 — Centre de pilotage GABON EDUC+ SERVICE

- Centre de pilotage séparé du produit Gabon Educ+.
- Indicateurs clients, abonnements, échéances et revenus.
- Fiche établissement, historique et paiements manuels.
- Accès réservé aux comptes autorisés par les politiques Supabase.

# v0.9.7 — verrouillage unifié des écritures

- Contrôle strict Supabase avant toute écriture dans Classes, Documents, Évaluations et Notes/Bulletins.
- Suppression du cache positif comme autorisation principale lorsque Supabase est configuré.
- Refus des écritures sans établissement cloud sélectionné.
- Les documents ne sont plus prévisualisés ni ajoutés localement avant confirmation de l’écriture.
- Les changements de statut d’abonnement sont propagés immédiatement aux modules ouverts.

# v0.9.6 — Sécurité fonctionnelle de tous les modules

- Contrôle proactif du statut d’abonnement dans les modules plateforme.
- Passage automatique en lecture seule pour Élèves, Parents, Utilisateurs/Enseignants, Documents, Emplois du temps, Matières et Assiduité.
- Passage en lecture seule pour Classes, Évaluations, Notes et Bulletins.
- Désactivation visuelle des formulaires et boutons d’écriture pendant une suspension.
- Conservation de la consultation des données existantes.
- Messages d’erreur explicites pour les suppressions et duplications bloquées.
- Correction du registre de notes : aucune modification locale ni opération de synchronisation n’est créée avant la validation de l’abonnement.
- Les contrôles SQL/RLS et triggers existants restent la dernière barrière côté serveur.

# v0.9.4.5 — Alerte de suspension améliorée

- Remplacement du petit message de suspension par un encadré central, visible et responsive.
- Ajout d’une icône d’alerte, d’un titre explicite et d’un badge « Accès en lecture seule ».
- Conservation du comportement de sécurité validé : consultation autorisée, écritures bloquées.

# v0.9.4.2 — Correctif suspension en rôle Administration

- Le rôle simulé Administration vérifie directement le statut de l’abonnement, même lorsque la session Supabase réelle appartient au super administrateur.
- Une annonce ne peut plus être enregistrée localement lorsque l’établissement est suspendu ou expiré.
- Le bouton Actualiser affiche désormais un état de chargement et l’heure de la dernière actualisation réussie.

## v0.9.4 — Sécurité des abonnements durcie

- contrôle d’abonnement avant toute écriture locale ;
- aucune donnée locale ni opération de synchronisation créée lorsque l’établissement est suspendu ;
- licence hors ligne limitée à 30 jours avec comportement fermé par défaut ;
- permissions opérationnelles complètes pour le super administrateur ;
- formulaire Annonces conservé lorsqu’une écriture est refusée ;
- audit SQL sans doublons et détection des tables non protégées.

## v0.9.3 — Sécurisation transversale des abonnements

- Bandeau d’abonnement visible dans tout l’espace GABON Éduc+.
- Message clair lors d’un blocage d’écriture pour abonnement suspendu.
- Migration 038 : garde automatique sur toutes les tables publiques possédant `school_id`.
- Fonction de contrôle `list_subscription_guarded_tables()` pour auditer les tables protégées.
- Les lectures restent autorisées ; les insertions, modifications et suppressions sont bloquées.

# Journal des modifications

## v0.9.2 — Abonnements, licences et garde-fous
- Table centralisée des abonnements, paiements et changements de statut.
- Période pilote automatique de 30 jours pour les établissements existants.
- Suspension progressive : lecture conservée, écritures bloquées en base.
- Licence hors ligne limitée à 30 jours.
- Page établissement « Abonnement et licence ».
- Console super-administrateur « GABON Educ+ Service — abonnements ».
- Bandeaux d’alerte pour essai, grâce et suspension.

# Journal des modifications

## Correctif v0.9.1 — registre de notes

- résolution des matières par nom ou code (`SVT`, par exemple) lors de la synchronisation ;
- ajout du référentiel combiné `Histoire-Géographie` utilisé par l'interface ;
- messages distincts quand la classe, le niveau ou la matière manque.

## 0.9.1 — Correctif de synchronisation métier

### Correctif bloquant après recette cloud

- rattachement obligatoire des classes à un `school_id` et à une vraie année scolaire UUID ;
- unification des élèves de **Mes classes** avec **Dossiers élèves**, **Parents**, **Assiduité** et **Documents** ;
- création et réparation des lignes `student_records` associées aux élèves de `class_students` ;
- affectations limitées aux enseignants actifs ayant accepté leur invitation, avec validation serveur de leur profil et de l’année scolaire ;
- enregistrement atomique des évaluations du registre et des notes dans `assessments` et `assessment_scores`, en plus du JSON de reprise ;
- rattachement obligatoire des fiches pédagogiques à l’établissement et à la classe sélectionnée ;
- migration corrective idempotente `032_v091_blocking_fixes.sql` pour les bases ayant déjà reçu la migration 031.

### Second correctif de validation

- conversion stricte des enveloppes métier vers les colonnes SQL réelles avant tout envoi Supabase ;
- conversion du rôle applicatif `guardian` en rôle SQL `parent` pour les invitations ;
- suppression des faux conflits entre les dates des notes et celles du workspace global ;
- clôture de toutes les opérations `grading` ou `settings` couvertes par une écriture cloud directe réussie ;
- validation stricte des coefficients positifs avant l’écriture d’une matière ;
- réassociation des opérations créées en mode local à l’utilisateur authentifié et à l’un de ses établissements actifs ;
- séparation de `users`, `subjects` et `assignments`, désormais envoyés respectivement vers les invitations, matières et affectations au lieu de `platform_workspaces` ;
- publication d’annonce, transfert et archivage d’élève corrigés pour transmettre l’entité complète ;
- migrations 004 et 019 rendues exécutables sur une installation neuve, plus migration 031 idempotente pour les bases v0.9.0 déjà migrées ;
- tests du trajet complet file locale → transport → écritures Supabase simulées sur les principaux modules.

### Corrigé

- les annonces utilisent désormais `announcements/create` et leur identifiant réel ;
- les publications d’annonces utilisent `announcements/update` ;
- classes, élèves, responsables, évaluations, assiduité, emplois du temps, documents, fiches et notes alimentent la file métier ;
- les formulaires asynchrones conservent leur référence avant `await`, supprimant le risque de `currentTarget` nul ;
- `PlatformManager.tsx` est livré formaté et lisible.

### Synchronisation

- ajout des types stricts `SyncModule`, `SyncOperationType` et `SyncOperationMetadata` ;
- fusion de plusieurs `update`, conservation de `create` suivi d’`update`, annulation de `create` suivi de `delete` ;
- mode local explicitement signalé sans suppression ni faux statut synchronisé ;
- centre enrichi avec date, tentatives, dernière erreur et statuts traduits.

### Tests

- tests des modules métier, du dédoublonnage, de la persistance locale et des formulaires asynchrones.
- tests de correspondance exacte entre payloads métier et colonnes SQL, sans clé enveloppe parasite.

## 0.9.0 — Préproduction et expérience connectée

### Ajouté

- centre de synchronisation, audit, notifications, import/export, sauvegarde et diagnostic ;
- migrations 023 à 030, page d’erreur et en-têtes de sécurité ;
- imports CSV validés avec rapport précis et sauvegardes JSON versionnées.

### Modifié

- écritures locales mises en file pour une reprise cloud ; navigation d’administration enrichie.

### Corrigé

- reprise après panne réseau bornée, sans chargement infini ni écrasement silencieux.

### Sécurité

- RLS par établissement, helpers d’autorisation, audit expurgé des secrets et CSP.

### Synchronisation

- dédoublonnage, cinq tentatives maximales, annulation et résolution locale/cloud/manuelle.

### Migration

- données v0.8.0 conservées ; migrations 001–022 inchangées.

### Performance

- index métier et cache immuable des ressources Next.js.

### Accessibilité

- composants partagés avec libellés, états et dialogues accessibles au clavier.

### Limites connues

- validation Supabase distante et tests multi-utilisateurs à réaliser sur le projet de préproduction ;
- l’envoi externe des notifications et invitations n’est pas inclus ;
- certains écrans métier v0.8.0 restent à harmoniser avec les nouveaux composants partagés.

## 0.8.0 — Plateforme établissement

### Ajouté

- assistant de configuration d’établissement, années, périodes et niveaux ;
- gestion locale/synchronisable des utilisateurs, rôles et invitations ;
- dossiers élèves, responsables et liens contrôlés ;
- matières, coefficients, affectations et professeur principal ;
- emplois du temps avec détection de conflits ;
- assiduité, annonces ciblées et onze modèles de documents ;
- espaces parent et élève explicitement présentés comme simulations locales ;
- permissions TypeScript centralisées, stockage local versionné et reprise de synchronisation ;
- migrations Supabase séquentielles 012 à 022 avec RLS ;
- import v0.7.0 sans suppression des données sources ni doublons ;
- tests des rôles, conflits, assiduité, documents, migration et RLS.

### Conservé

- `ClassesManagerLocal` reste l’implémentation officielle de `Mes classes` ;
- toute la chaîne notes, moyennes, appréciations, bulletin A4 et snapshot de v0.7.0 ;
- migrations 001 à 011 inchangées.

### Limites connues

- l’envoi réel d’invitations exige un service d’e-mail côté serveur ;
- l’export PDF utilise la boîte d’impression du navigateur ;
- les rôles locaux ne remplacent pas les politiques RLS d’un projet Supabase déployé.

## 0.7.0 — Première version connectée

### Ajouté

- profil enseignant et paramètres du compte ;
- stockage hybride commun : Supabase, démonstration locale et hors ligne temporaire ;
- synchronisation progressive des fiches et des classes ;
- module Évaluations avec questions, corrigé, barème, impression et export PDF ;
- première consultation des Programmes APC ;
- import et export CSV des élèves ;
- migrations Supabase 006 à 008 ;
- 13 tests automatisés.

### Modifié

- tableau de bord alimenté par les données réellement enregistrées ;
- Mes classes enrichi sans remplacer `ClassesManagerLocal` ;
- Mes fiches préserve les copies locales avant toute tentative cloud ;
- moteur APC relié aux classes et aux progressions ;
- récupération du mot de passe rendue fonctionnelle ;
- contrôle continu enrichi avec tests et vérification TypeScript.

### Corrigé

- chargements infinis lorsque Supabase est partiellement configuré ;
- perte potentielle d’une fiche lors d’une erreur réseau ;
- chiffres fictifs présentés comme réels dans le tableau de bord ;
- avertissement CSS `align-items: end`.

### Sécurité

- isolation RLS des évaluations par enseignant ;
- maintien de l’isolation RLS des classes, élèves, fiches et profils ;
- aucune clé secrète ni clé `service_role` dans le navigateur.

### Limites connues

- la connexion réelle nécessite un projet Supabase et l’exécution des migrations ;
- aucune base Supabase distante n’est fournie avec l’archive ;
- l’export PDF utilise la boîte d’impression du navigateur ;
- les progressions intégrées hors Supabase sont des exemples clairement non officiels ;
- aucune API d’IA externe n’est connectée.

## Refonte espace enseignants
- Nouvelle page de connexion enseignants.
- Nouveau tableau de bord en trois colonnes inspiré du modèle fourni.
- Navigation horizontale et adaptation mobile.

## v0.9.4.3 — contrôle strict du rôle Administration

- Ajout de `school_can_write_strict(uuid)`, sans dérogation `super_admin`.
- Le rôle simulé Administration respecte désormais la suspension réelle de l'établissement.
- Le rôle Super administrateur conserve son droit d'intervention et de réactivation.

## v0.9.4.4 — Liaison établissement cloud et suspension
- Ajout de la sélection explicite de l’établissement actif dans Service abonnements.
- Résolution automatique de l’établissement depuis le stockage local, le workspace cloud ou l’adhésion active.
- Blocage par défaut des écritures Administration si aucun établissement cloud valide n’est sélectionné.
- Le contrôle strict de suspension utilise désormais le véritable school_id.

## v0.10.2 — Parcours d’inscription par type d’établissement

- Remplace les badges décoratifs du portail par un vrai choix initial du type d’établissement.
- Ajoute le parcours : choix du type → ouverture de compte → enregistrement établissement → connexion administration.
- Prépare automatiquement les niveaux selon le profil choisi : primaire, collège, lycée ou complexe scolaire.
- Ajoute une migration Supabase `042_v0102_establishment_onboarding_flow.sql` avec une fonction d’enregistrement guidé.
- Conserve les protections d’abonnement et de suspension déjà validées.
