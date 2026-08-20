# Livraison Gabon Éduc+ v0.9.0

Version : 0.9.0 — Préproduction et expérience connectée.

## Livré

- conservation de toutes les routes et données locales v0.8.0 ;
- synchronisation différée, cinq tentatives, annulation, conflits et choix explicite ;
- audit expurgé, notifications internes, import/export CSV et sauvegarde JSON ;
- diagnostic administrateur, page d’erreur, en-têtes de sécurité ;
- migrations 023–030 avec RLS, index et snapshots append-only ;
- plus de 80 tests automatisés.

## Partiel et actions manuelles

- appliquer et valider les migrations sur un projet Supabase de préproduction sauvegardé ;
- configurer URL, clé publique, redirections Auth et domaines CORS ;
- exécuter les scénarios multi-comptes et multi-établissements de `docs/TESTS_SECURITE.md` ;
- connecter un prestataire d’e-mail si les invitations doivent être envoyées réellement.

Les rôles locaux démontrent l’UX mais ne remplacent jamais Auth et RLS. Aucun modèle scolaire n’est présenté comme homologué.

## Contrôles de livraison

- `npm install` : réussi, dépendances à jour ;
- `npm run typecheck` : réussi, 0 erreur ;
- `npm run lint` : réussi, 0 erreur et 0 avertissement ;
- `npm run test` : 20 fichiers, 102 tests réussis sur 102 ;
- `npm run build` : réussi, 35 pages statiques générées, 33 routes applicatives listées dont l’API ;
- migrations 001–022 : empreintes identiques à la base validée ;
- migrations ajoutées : 023 à 030 ;
- démarrage HTTP manuel dans le conteneur : non exécuté, Node 24 a renvoyé `uv_interface_addresses`; le build Next.js reste réussi. Refaire le parcours sous Node 20 comme configuré dans Netlify.

## Risques techniques

- l’instance Supabase distante, ses JWT, CORS et policies n’étaient pas disponibles : les scénarios RLS réels restent à faire ;
- la collision historique possible autour de `attendance_records` dans 010/019 doit être contrôlée avant 029 ;
- CSP compatible Next.js autorise encore `unsafe-inline` et `unsafe-eval` ; utiliser des nonces avant exposition publique sensible ;
- les écrans historiques v0.8.0 ne sont pas tous migrés vers le nouveau design partagé.
