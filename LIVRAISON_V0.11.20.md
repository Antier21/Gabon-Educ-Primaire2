# Gabon Éduc+ v0.11.20

## Correctif bloquant — enregistrement du personnel

- Le formulaire conserve sa présentation et son fond gris `#696969`.
- Le formulaire est capturé avant les appels asynchrones : sa remise à zéro ne plante plus après l’insertion Supabase.
- Suppression de l’appel réseau `auth.getUser()` inutile avant l’écriture ; `created_by` est attribué par `auth.uid()` dans Supabase.
- Le bouton affiche `Enregistrement…`, interdit les doubles clics et revient toujours à son état normal.
- Le matricule, la fonction et la date d’embauche ne bloquent plus le navigateur lorsque leurs valeurs automatiques doivent s’appliquer.
- Les champs facultatifs vides sont envoyés à Supabase sous forme de `null`, pas de chaînes vides.
- Les messages distinguent maintenant doublon de matricule, droits RLS et schéma Supabase non mis à jour.
- La réussite n’est plus masquée lorsqu’un simple rechargement de la liste échoue.
- Ajout de tests sur le dossier envoyé à Supabase.

## Supabase

Exécuter ce fichier unique dans l’éditeur SQL Supabase :

`supabase/migrations/053_v01120_staff_registration.sql`

Cette migration est autonome : elle complète aussi une ancienne table incomplète, répare les valeurs historiques, confirme les valeurs par défaut, accorde les droits au rôle `authenticated`, recrée les politiques RLS et recharge le cache du schéma.
