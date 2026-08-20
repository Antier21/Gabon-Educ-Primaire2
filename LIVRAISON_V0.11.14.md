# Gabon Éduc+ v0.11.14

## Correctif déploiement Netlify / Next.js 15

Cette version corrige l'échec de build Netlify lié à `searchParams`.

Cause :
- Next.js 15 attend que `searchParams` soit typé comme une Promise dans les composants de page serveur.
- Certaines pages utilisaient un typage mixte `Promise<...> | objet`, refusé pendant la vérification TypeScript du build Netlify.

Pages corrigées :
- `app/gabon-educ/ouvrir-compte/page.tsx`
- `app/gabon-educ/enregistrer-etablissement/page.tsx`
- `app/gabon-educ/connexion-administration/page.tsx`
- `app/gabon-educ/inscription/page.tsx`

Aucune migration Supabase.
