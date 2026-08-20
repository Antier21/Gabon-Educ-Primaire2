# Gabon Éduc+ — Architecture de la base de données

## Principe général

La base est organisée autour de neuf domaines :

1. **Identité et rôles** : profils, rôles, permissions.
2. **Établissements** : écoles et membres.
3. **Organisation scolaire** : années, niveaux, classes, inscriptions et affectations.
4. **Programmes officiels** : curricula, unités, compétences, objectifs et progressions hebdomadaires.
5. **Préparation des cours** : fiches pédagogiques, étapes et ressources.
6. **Évaluation** : banques de questions, évaluations, copies et corrections.
7. **Relations familles-école** : parents liés aux élèves.
8. **Abonnements** : offres, souscriptions et paiements.
9. **Services transversaux** : IA, notifications et journal d’audit.

## Choix technique

Le schéma cible **PostgreSQL**, idéalement via **Supabase**, car cette solution apporte :

- authentification ;
- base PostgreSQL ;
- stockage de fichiers ;
- règles de sécurité par utilisateur ;
- API générée automatiquement ;
- déploiement rapide pour une première version.

## Première version à développer

Pour le MVP, seules les parties suivantes sont indispensables :

- profiles ;
- user_roles ;
- subjects ;
- grade_levels ;
- curricula ;
- curriculum_units ;
- learning_objectives ;
- weekly_progressions ;
- lesson_plans ;
- lesson_steps ;
- resources.

Les écoles, élèves, parents, évaluations et abonnements pourront être activés progressivement sans reconstruire la base.

## Flux principal d’un enseignant

1. Il se connecte.
2. Il choisit une matière et un niveau.
3. Il sélectionne la semaine ou l’objectif officiel.
4. Il crée une fiche de cours, manuellement ou avec l’IA.
5. Il ajoute des ressources et exercices.
6. Il enregistre, publie ou exporte son cours en PDF.
