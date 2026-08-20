# Gabon Éduc+ v0.11.3

## Raccord Personnel → Pédagogie → Emploi du temps
- Les employés actifs de catégorie `teacher` ayant un `pedagogical_user_id` sont maintenant fusionnés dans la source pédagogique commune de l'établissement.
- Ils apparaissent donc dans les affectations et dans la liste Enseignant du module Emploi du temps.
- Après la création d'un profil pédagogique, le bloc Pédagogie est remonté immédiatement afin d'éviter un état périmé.
- La liste Enseignant de l'emploi du temps est limitée aux enseignants/professeurs principaux actifs.

## Génération automatique
Le bouton reste volontairement verrouillé tant que les prérequis métier ne sont pas tous remplis :
- établissement et année scolaire actifs ;
- au moins une classe ;
- matières actives ;
- volumes horaires hebdomadaires ;
- affectations classe–matière–enseignant (ou titulaire au primaire).

Aucune nouvelle migration Supabase n'est nécessaire si la migration 048 a déjà été exécutée.
