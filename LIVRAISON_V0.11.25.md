# Gabon Éduc+ v0.11.25

## Cause réelle du dossier élève absent

Le navigateur n’ajoute pas automatiquement le bouton cliqué dans `new FormData(form)`. Le bouton `Valider et créer le dossier élève` était donc interprété comme le bouton `Enregistrer` : la fiche restait en brouillon, aucun dossier élève n’était créé et le tableau de bord restait à zéro.

La v0.11.25 lit explicitement le bouton utilisé. Une validation crée maintenant réellement le dossier élève et l’associe à sa classe.

## Clarification du tableau de bord

L’en-tête Administration affiche en évidence :

- le type d’établissement actif ;
- son statut public ou privé ;
- le nom de l’établissement concerné.

L’encadré reste lisible sur ordinateur et se replace sur une ligne dédiée sur mobile.
