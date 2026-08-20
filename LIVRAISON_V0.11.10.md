# Gabon Éduc+ v0.11.10 — emplois du temps redimensionnés

- Tous les emplois du temps hebdomadaires utilisent désormais une grille fluide sur 100 % de la largeur disponible.
- Lundi à samedi restent visibles simultanément sur ordinateur, sans défilement horizontal.
- Suppression des `min-width` qui forçaient les tableaux à dépasser leur conteneur.
- Colonne horaire réduite et cellules compactées pour se rapprocher des dimensions validées sur la capture de référence.
- Fond gris remplacé par `#FFFFE0` sur les cellules, en-têtes et repères horaires.
- Les cours déjà programmés conservent le même fond afin de garder une grille homogène ; les conflits restent signalés en rouge.
- Appliqué au tableau de bord enseignant, à la grille administration/pédagogie, à « Voir mes classes » et au tableau intégré à la préparation des cours.
- Aucune migration Supabase requise.
