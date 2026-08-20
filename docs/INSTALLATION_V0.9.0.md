# Installation v0.9.0

Prérequis : Node.js 20, npm et, pour le cloud, un projet Supabase.

1. `npm install`
2. Copier `.env.example` vers `.env.local` et remplacer uniquement l’URL et la clé publique.
3. `npm run dev`, puis ouvrir `/gabon-educ`.
4. Pour le cloud, sauvegarder la base puis appliquer 001–030 dans l’ordre.
5. Avant livraison : `npm run check`.

Sans configuration complète, l’application reste en mode local. Ne jamais placer `service_role` dans une variable `NEXT_PUBLIC_*`.
