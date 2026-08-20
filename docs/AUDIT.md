# Journal d’audit

Le journal enregistre utilisateur, établissement, rôle, action, module, entité, statut, date et message. Les noms de champs sensibles (`password`, `token`, `secret`, `cookie`, `session`, `authorization`) sont expurgés. Le mode local est une aide de diagnostic modifiable par le navigateur ; le journal serveur avec RLS constitue la piste opposable en cloud. Les versions figées restent append-only.
