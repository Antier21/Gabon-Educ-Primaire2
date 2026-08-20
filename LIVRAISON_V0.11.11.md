# Gabon Éduc+ v0.11.11

## Correctif génération / impression des documents

Cette version stabilise les documents scolaires générés et imprimés.

### Corrections appliquées
- Les documents sont maintenant rendus dans un conteneur A4 portrait stable.
- L’impression est isolée : seul le document choisi est imprimé, pas les menus, tableaux de liste, boutons ou éléments flottants.
- Les largeurs sont fixées en millimètres pour éviter les déformations au passage écran → impression/PDF.
- Les tableaux utilisent un `table-layout: fixed` et des retours de ligne contrôlés.
- Les grilles d’identité, signatures, résumés et légendes ne débordent plus du document.
- Le bouton « Imprimer / enregistrer en PDF » active une classe temporaire d’impression puis nettoie l’état après impression.
- La liste des documents générés est exclue de l’impression.

### Supabase
Aucune nouvelle migration Supabase.
