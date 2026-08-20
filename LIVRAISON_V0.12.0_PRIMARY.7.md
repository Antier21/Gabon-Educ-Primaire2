# Gabon Éduc+ Primaire v0.12.0-primary.7

## Intégration de la maternelle

- Ajout des niveaux Petite Section, Moyenne Section et Grande Section.
- Maintien du primaire élémentaire de la 1ère à la 5e Année, sans 6e année primaire.
- Ajout de six domaines d’apprentissage adaptés à la maternelle.
- Évaluation exclusivement qualitative en maternelle : Acquis, En cours d’acquisition, Non encore acquis, Non évalué.
- Aucun calcul de moyenne, aucune note numérique et aucun classement pour les classes de maternelle.
- Ajout d’un carnet de suivi des apprentissages imprimable.
- Les classes de 1ère à 5e Année conservent leur notation sur 10 et leur bulletin actuel.
- Ajout de la migration Supabase `058_preschool_levels.sql`.

## Déploiement

Le ZIP est prêt à être déployé comme l’édition Primaire existante. Les variables d’environnement ne changent pas. La migration 058 doit être appliquée à Supabase pour rendre PS, MS et GS disponibles en mode connecté.

## Vérification

- Vérification TypeScript : réussie.
- Tests ciblés niveaux/évaluations/stockage : 25 réussis.
- Build Next.js de production : réussi.
