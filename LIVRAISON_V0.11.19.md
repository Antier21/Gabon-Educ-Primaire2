# Gabon Éduc+ v0.11.19

## Correctifs demandés

### Couleurs des formulaires
- Formulaire d'inscription des élèves : fond général `#2F4F4F`.
- Formulaire d'enregistrement du personnel : fond général `#696969`.
- Seuls les champs de saisie, listes déroulantes et zones de texte restent blancs.

### Réparation du formulaire Personnel
- Correction de l'erreur d'enregistrement liée aux valeurs nulles.
- Les champs obligatoires reçoivent maintenant une valeur sûre si nécessaire :
  - matricule automatique si vide ;
  - fonction par défaut `Personnel` si vide ;
  - date d'embauche du jour si vide ;
  - type de contrat `Autre` si vide.
- Ajout de `created_by` quand l'utilisateur connecté est disponible.
- Message d'erreur plus lisible dans l'interface.

Aucune migration Supabase.
