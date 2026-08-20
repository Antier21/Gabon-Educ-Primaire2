# Déploiement de préproduction

1. Créer une instance Supabase et une cible Netlify dédiées.
2. Configurer les variables publiques, URL HTTPS, CORS et redirections Auth.
3. Sauvegarder puis appliquer 001–030 ; contrôler 010/019 avant 029.
4. Exécuter `npm ci && npm run check`.
5. Tester les rôles et établissements avec de vrais comptes.
6. Vérifier CSP, cookies, logs, sauvegarde/restauration et rollback.
7. N’autoriser le pilote qu’après signature de la checklist.

La CSP contient `unsafe-inline`/`unsafe-eval` pour compatibilité Next.js actuelle : la resserrer avec nonces avant une exposition publique à haut risque.
