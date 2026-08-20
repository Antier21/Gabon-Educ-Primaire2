# Gabon Éduc+ Primaire v0.12.0-primary.12

## Correctif établissement actif et classes

- Résolution directe de la session Supabase et des établissements réellement associés au compte.
- Suppression de la dépendance au chargement complet de la plateforme pour afficher le profil.
- Réinitialisation automatique du cache d’établissement lorsqu’un autre compte se connecte.
- Contrôle de l’abonnement sur le véritable établissement actif.
- Affichage distinct entre une suspension réelle et une indisponibilité technique.
- Chargement des niveaux Maternelle et Primaire dans le formulaire de classe.
- Blocage du formulaire tant que l’établissement n’est pas résolu.
- Suppression des faux passages en « Démonstration locale » causés par une vérification réseau répétée.
- Renforcement de l’isolation de `school_can_write_strict`.

## Installation locale

Le fichier `.env.local` n’est volontairement pas inclus dans le ZIP. Conservez
celui de votre dossier de test actuel ou recopiez-le après extraction.

Après remplacement du projet, exécuter une seule fois :

```powershell
npx.cmd supabase migration up --local
```

Cette commande applique la migration `060_active_school_security.sql` à la base
locale existante sans supprimer les comptes ni les écoles de test.
