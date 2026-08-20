# Gabon Éduc+ v0.11.8

## Corrections
- Compteurs de classes : source officielle unique, indépendante du chargement RH/pédagogique.
- Le type réel de l’établissement est relu depuis `schools` avant de filtrer les niveaux.
- Le module Créer un enseignant affiche les erreurs de schéma en rouge et indique la migration à appliquer.
- Migration 050 idempotente : crée `school_staff.pedagogical_user_id` si nécessaire et recharge PostgREST.

## Espace enseignant → Mes classes
- Un enseignant ne peut plus créer, modifier ou supprimer une classe.
- Il voit uniquement les classes auxquelles il est effectivement affecté.
- Il voit les effectifs de ses classes.
- Un emploi du temps éditable figure directement dans Mes classes.
- Chaque case est cliquable et permet de programmer une matière parmi les matières réellement affectées à cet enseignant pour la classe.
- Les conflits simples classe/enseignant sont bloqués avant enregistrement.
- L’administration conserve le module « Créer une classe » avec les fonctions de création.
