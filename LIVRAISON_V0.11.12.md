# Gabon Éduc+ v0.11.12

## Correctif prioritaire : bulletins scolaires primaire et secondaire

Cette version verrouille le gabarit A4 des bulletins pour éviter les déformations entre l'aperçu dans l'application, l'aperçu d'impression et l'enregistrement en PDF.

Corrections appliquées :
- les règles mobiles ne s'appliquent plus au mode impression ;
- les bulletins primaire et secondaire utilisent un gabarit A4 portrait fixe ;
- la grille d'identité reste en 3 colonnes ;
- le résumé moyenne/rang/absences/mention reste en 4 colonnes ;
- les signatures restent en 3 colonnes ;
- le tableau du bulletin secondaire reçoit des largeurs de colonnes fixes ;
- les marges, tailles de police et hauteurs sont compactées pour tenir sur une seule page A4 ;
- le texte de modèle/disclaimer est masqué à l'impression pour éviter une deuxième page ;
- les boutons d'action ne sont pas imprimés.

Aucune migration Supabase.
