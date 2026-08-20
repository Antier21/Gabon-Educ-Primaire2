# Gabon Éduc+ v0.11.4

## Emploi du temps primaire
- La grille est désormais affichée par classe.
- Chaque case est cliquable : un formulaire s’ouvre avec la classe, le jour, le créneau, toutes les matières actives, l’enseignant et la salle.
- Une case déjà remplie peut être modifiée ou supprimée.
- En primaire, la sélection d’une matière propose automatiquement l’enseignant titulaire, sauf exception pédagogique enregistrée pour cette matière.
- L’affectation d’un titulaire installe aussi les matières manquantes du profil primaire puis l’affecte à chacune d’elles.
- La liste de suggestions du primaire a été enrichie et reste configurable par l’établissement.

## Génération automatique
- Le moteur automatique reste distinct de la saisie manuelle par case.
- Les volumes hebdomadaires sont toujours nécessaires uniquement pour la génération automatique ; la saisie manuelle reste disponible sans eux.

## Supabase
Aucune nouvelle migration SQL.
