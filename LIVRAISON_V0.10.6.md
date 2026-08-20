# Gabon Éduc+ v0.10.6 — Correctifs Pronote et impressions

Cette version corrige les retours de test de la v0.10.5.

## Corrections

1. La barre des semaines est désormais exploitable :
   - dans Notes & bulletins, cliquer une semaine prépare une évaluation sur cette semaine ;
   - dans Évaluations, cliquer une semaine ouvre la création d’une évaluation prépositionnée ;
   - dans Mes fiches, cliquer une semaine ouvre le cahier de textes sur cette semaine.

2. Le relevé de notes importe automatiquement les évaluations créées dans le module Évaluations lorsqu’elles sont rattachées à une classe. Chaque évaluation devient une colonne du relevé.

3. Les pages blanches à l’impression ont été corrigées : la règle CSS globale qui masquait tout le contenu imprimable a été supprimée.

4. L’impression des évaluations ne dépend plus d’une fenêtre surgissante : elle utilise une iframe d’impression intégrée, ce qui évite le message demandant d’autoriser les popups.

5. Le module Emploi du temps affiche désormais un tableau hebdomadaire proche du modèle fourni, avec lignes horaires et colonnes de jours.

6. Le tableau de bord Professeur n’utilise plus les fausses classes générées en vert. Les cases de l’emploi du temps sont neutres et cliquables vers le cahier de textes pour la semaine, le jour et l’heure concernés.

## Migration Supabase

Aucune nouvelle migration Supabase n’est nécessaire.
