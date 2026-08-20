# Gabon Éduc+ v0.11.15

## Correctif build Netlify / TypeScript

Cette version corrige l'erreur TypeScript signalée par Netlify dans :

- `components/PersonnelManager.tsx`

Cause :
- `loadPlatformWorkspace()` retourne `{ workspace, mode, message }`.
- Le composant utilisait par erreur `w.school?.id` au lieu de `w.workspace.school?.id`.

Correction :
- remplacement par `w.workspace.school?.id`.

Aucune migration Supabase.
