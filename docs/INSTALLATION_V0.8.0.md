# Installation v0.8.0

## Prérequis

- Node.js 20 ou supérieur ;
- npm ;
- facultativement un projet Supabase.

## Local

```bash
npm install
npm run dev
```

Sans `.env.local`, utiliser la connexion de démonstration. Les données restent sur l’appareil. Pour une connexion distante, renseigner uniquement `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, puis appliquer les migrations 001 à 022.

## Vérification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Ne jamais exposer une clé `service_role` dans le navigateur.
