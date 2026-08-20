# Gabon Éduc+ v0.11.6

## Créer un enseignant
- Suppression de l’emboîtement `PlatformManager embedded` qui déformait la page.
- Formulaire autonome et responsive.
- Activation du profil pédagogique conservée.
- Affectations pédagogiques intégrées directement dans le module.
- Primaire : titulaire de classe + exception par matière.
- Collège/lycée : enseignant + classe + matière.

## Compteurs de classes
- Les tableaux de bord Administration, Enseignant et le tableau de pilotage interne chargent désormais les classes après résolution de l’établissement actif.
- La même source `class_groups`/`listClasses` avec `school_id` et `school_type` est utilisée.
- Suppression des comptages dépendant d’un contexte local non encore résolu.

## Emploi du temps
- La grille cliquable de la v0.11.4 est conservée sans modification.

## Supabase
- Aucune nouvelle migration SQL.
