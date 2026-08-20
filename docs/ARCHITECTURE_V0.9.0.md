# Architecture v0.9.0

Next.js App Router sépare les pages, composants clients et bibliothèques TypeScript pures. Le stockage local versionné reste la source de continuité hors ligne. `lib/sync` transforme les écritures en opérations idempotentes, les transporte vers Supabase puis exige une décision explicite en cas de conflit. Supabase Auth et les policies RLS restent l’autorité en mode cloud. Les domaines audit, notifications, imports, sauvegardes, erreurs et diagnostic ne contiennent aucune clé secrète.

Les migrations 001–022 sont l’historique v0.8.0 immuable ; 023–030 ajoutent la préproduction. `ClassesManagerLocal` demeure l’implémentation officielle de Mes classes.
