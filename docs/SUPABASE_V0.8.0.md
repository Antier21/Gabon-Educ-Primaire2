# Supabase v0.8.0

Appliquer les migrations de `supabase/migrations` dans l’ordre numérique. Les fichiers 001–011 constituent l’historique v0.7.0. Les fichiers 012–022 ajoutent :

| Migration | Domaine |
| --- | --- |
| 012 | établissement et workspace hybride |
| 013 | membres, rôles et invitations |
| 014 | années, périodes et niveaux |
| 015 | dossiers élèves et transferts |
| 016 | responsables et liens élèves |
| 017 | matières et affectations |
| 018 | emplois du temps |
| 019 | assiduité |
| 020 | annonces |
| 021 | documents et journal de génération |
| 022 | workflow et audit des bulletins |

Avant une production, exécuter les migrations sur une base de préproduction, vérifier les index et tester chaque rôle avec des comptes distincts.
