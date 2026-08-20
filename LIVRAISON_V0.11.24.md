# Gabon Éduc+ v0.11.24

## Correctif de la liste des élèves

- La liste locale d’une classe conserve désormais les élèves en attente de synchronisation au lieu d’être écrasée par une réponse Supabase encore incomplète.
- Une inscription est automatiquement affectée à l’unique classe correspondant au niveau choisi lorsque le champ de classe a été laissé vide.
- La migration 056 installe une synchronisation automatique en base : toute création ou modification d’un dossier élève alimente immédiatement la liste de sa classe.
- Les élèves actifs déjà enregistrés avec une classe sont réparés lors de l’exécution de la migration.

## Installation

1. Déployer la version 0.11.24.
2. Exécuter `supabase/migrations/056_student_roster_automatic_sync.sql` dans Supabase.
3. Recharger l’application puis ouvrir Gestion des classes.
