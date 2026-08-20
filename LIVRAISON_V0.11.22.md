# Gabon Éduc+ v0.11.22

## Compatibilité définitive du registre Personnel

- Corrige l’erreur PostgreSQL `23502` sur l’ancienne colonne obligatoire `school_staff.category`.
- La migration 054 ajoute ou répare la colonne héritée et la synchronise automatiquement avec `staff_category`.
- Les anciennes et nouvelles structures de la table peuvent ainsi recevoir les mêmes dossiers.
- Les messages d’erreur ne citent plus un numéro de migration devenu ancien.
- Aucun changement visuel du formulaire.

## Supabase

Exécuter : `supabase/migrations/054_v01122_staff_legacy_category.sql`.
