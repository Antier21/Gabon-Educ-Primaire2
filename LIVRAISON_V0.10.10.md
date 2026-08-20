# Gabon Éduc+ v0.10.10 — Mes classes : contexte stable après création

## Problème corrigé
Une classe pouvait être créée avec succès dans `class_groups` (HTTP 201) mais ne pas rester visible dans « Mes classes ».

## Cause
Après `saveClassRecord`, le composant ajoutait correctement la classe à l’état React puis appelait immédiatement `reload()`. Ce `reload()` rappelait `loadPlatformWorkspace()`, donc relançait toute la résolution de l’établissement. Cette seconde résolution pouvait remplacer la liste qui venait d’être mise à jour.

## Correction
- La résolution globale de l’établissement est réservée au chargement initial de la page.
- Après création/modification/suppression d’une classe ou d’un élève, la page recharge uniquement `class_groups` avec le `school_id` et le `schoolType` déjà résolus.
- Une erreur de relecture après un enregistrement réussi ne retire plus la classe affichée.
- La même règle de contexte stable est appliquée aux opérations élèves/import/suppression.

## Migration Supabase
Aucune nouvelle migration.
