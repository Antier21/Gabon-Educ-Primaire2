# Gabon Éduc+ v0.10.9.4 — isolation stricte des établissements

## Correctif critique

Cette version corrige un défaut de sélection d’établissement après connexion. Une valeur `active-school` conservée dans le navigateur pouvait être utilisée avant la vérification des adhésions Supabase du compte courant. Un utilisateur pouvait ainsi voir l’établissement précédemment ouvert sur le même navigateur.

### Règles désormais appliquées

- Supabase (`school_memberships`) est la source d’autorité pour déterminer les établissements accessibles au compte connecté.
- Un identifiant d’établissement conservé dans `localStorage` n’est utilisé que s’il appartient aux adhésions actives du compte courant.
- Lors d’une connexion du compte principal par e-mail, les anciennes références locales d’établissement sont effacées avant le chargement du nouvel espace.
- Les profils d’établissement et niveaux restent ceux de la v0.10.9.3 : primaire, collège, lycée et complexe scolaire sont strictement séparés.

Aucune nouvelle migration SQL n’est requise pour ce correctif.
