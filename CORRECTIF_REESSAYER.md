# Correctif du bouton « Réessayer »

Le bouton de ligne plaçait seulement l'opération en attente sans lancer la file de synchronisation.
Après cinq tentatives, il pouvait aussi lever une erreur invisible et sembler ne plus réagir.

Le correctif :
- remet à zéro le compteur lors d'une relance manuelle ;
- lance immédiatement la synchronisation après le clic ;
- désactive le bouton pendant le traitement ;
- affiche une erreur visible si la relance échoue.
