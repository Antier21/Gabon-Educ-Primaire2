# Gabon Éduc+ v0.11.13

## Correctif bulletins : retour au gabarit propre

Cette version annule les règles trop agressives de la v0.11.12 qui avaient aplati le bulletin.

Nouvelle méthode :
- le modèle visuel initial du bulletin est conservé ;
- les règles mobiles sont limitées à l'écran et ne s'appliquent plus à l'impression ;
- les blocs Identité, Résumé et Signatures restent en colonnes au moment d'imprimer ;
- le tableau garde toute sa largeur utile sans forcer un écrasement ;
- le texte de bas de page/disclaimer est masqué à l'impression pour éviter une page supplémentaire ;
- les boutons d'action ne sont pas imprimés.

Aucune migration Supabase.
