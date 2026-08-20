# Gabon Éduc+ v0.11.9

## Compteur de classes unifié
- Le tableau de bord Administration utilise désormais exactement la même séquence que « Créer une classe » : `loadPlatformWorkspace()` puis `listClasses({ schoolId, schoolType })`.
- Le compteur ne dépend plus d’un calcul différent fondé sur les élèves ou sur un contexte par défaut.

## Espace enseignant
- Le module et le titre visible deviennent « Voir mes classes ».
- L’enseignant ne crée pas de classe.
- Son tableau de bord compte uniquement les classes qui lui sont affectées pédagogiquement.
- La création des classes reste réservée à l’administration/pédagogie.

## Supabase
- Conserver/exécuter la migration 050 si elle n’a pas encore été appliquée.
