# Gabon Éduc+ v0.11.23

## Correctifs livrés

1. Lorsqu’une inscription est validée avec une classe, le dossier élève et la liste de cette classe sont désormais alimentés dans la même synchronisation.
2. Le bouton `Imprimer en A4` génère une fiche dédiée, compacte et stable, limitée à une page A4 portrait.
3. Le module `Mes classes` distingue strictement les rôles :
   - la direction conserve la création et la gestion des classes ;
   - l’enseignant ne voit que ses classes affectées ;
   - l’enseignant peut saisir une note, préparer un cours, planifier une évaluation et compléter son emploi du temps.

## Mise à jour Supabase obligatoire

Après le déploiement du code, exécuter uniquement le contenu SQL du fichier :

`supabase/migrations/055_classes_students_roles_and_roster.sql`

Cette migration applique les droits par rôle et rattache également aux listes de classe les élèves actifs déjà inscrits.

## Contrôles réalisés

- test du mapping Supabase : 11 tests réussis ;
- vérification TypeScript réussie ;
- ESLint ciblé réussi ;
- compilation de production Next.js réussie sur 52 pages.
