# Gabon Educ+ v0.10.9.1 — Correctif diagnostic accès utilisateurs

Base : v0.10.9 identifiants et codes d’accès.

Corrections :
- remplacement du domaine technique `access.gabon-educ.local` par `access.gaboneducplus.app` ;
- meilleure remontée des erreurs Supabase dans le formulaire ;
- journalisation serveur de la vraie erreur de création d’accès ;
- évite un blocage si le créateur n’a pas de profil applicatif exploitable pour `created_by` / `invited_by`.

Aucune migration Supabase supplémentaire n’est nécessaire.

Variable optionnelle :
```env
NEXT_PUBLIC_ACCESS_EMAIL_DOMAIN=access.gaboneducplus.app
```
