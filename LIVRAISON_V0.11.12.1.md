# Gabon Éduc+ v0.11.12.1

## Correctif build Next.js

Cette version corrige l'erreur de compilation apparue dans `SchoolDocumentTemplates.module.css`.

Cause :
- un fichier CSS Module ne peut pas contenir directement le sélecteur global `html, body`.

Correction :
- les règles d'impression globales utilisent désormais `:global(html)` et `:global(body)`.
- le correctif A4 des bulletins primaire et secondaire est conservé.

Aucune migration Supabase.
