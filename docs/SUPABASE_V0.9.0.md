# Supabase v0.9.0

Configurer `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Appliquer séquentiellement 001–030 après sauvegarde et d’abord sur préproduction. Contrôler les redirections Auth, les domaines CORS, les cookies HTTPS et les policies avec quatre comptes distincts.

Attention : les migrations historiques 010 et 019 ciblent toutes deux `attendance_records`. Elles sont conservées telles quelles conformément à l’immutabilité demandée. Sur une base vierge, contrôler leur compatibilité avant 029 et effectuer une correction opérateur si le schéma historique diffère. La validation locale ne vaut pas validation d’une instance distante.
