# Gabon Éduc+ Primaire v0.12.0-primary.11

## Compléments maternelle

- Petite Section, Moyenne Section et Grande Section restent intégrées avant la 1ère Année.
- Les observations utilisent exclusivement les niveaux Acquis, En cours d’acquisition, Non encore acquis et Non évalué.
- Aucune note numérique, moyenne ou classement n’est produit pour la maternelle.
- Les appréciations sont adaptées : progrès par domaine, progression générale, autonomie et vie en groupe, suite du parcours.
- Le carnet de suivi est sélectionné automatiquement pour une classe maternelle ; le bulletin sur 10 reste réservé à la 1ère–5e Année.
- Les domaines et niveaux de maîtrise sont désormais persistés dans les tables relationnelles Supabase, en plus de l’espace JSON synchronisé.

## Migration obligatoire

Après les migrations précédentes, exécuter dans Supabase :

`supabase/migrations/059_preschool_grading_persistence.sql`

Cette migration ajoute les six domaines de maternelle, le mode d’évaluation et le niveau de maîtrise aux données relationnelles.
