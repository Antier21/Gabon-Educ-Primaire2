# Gabon Éduc+ Primaire v0.12.0-primary.13

## Correctif de résolution des établissements A/B

- Résolution de l'établissement par une fonction Supabase sécurisée liée à `auth.uid()`.
- Contournement des politiques RLS historiques susceptibles de bloquer la lecture directe des appartenances.
- Conservation stricte de l'isolation : la fonction ne renvoie que les établissements de la session connectée.
- Utilisation immédiate du profil local déjà validé lorsqu'il appartient encore au compte.
- Affichage du véritable message Supabase si une erreur technique subsiste.

Après extraction dans le dossier du projet et avant `npm.cmd run dev` :

```powershell
npx.cmd supabase migration up --local
```
