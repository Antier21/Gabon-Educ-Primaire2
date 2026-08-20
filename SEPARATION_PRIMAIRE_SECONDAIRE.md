# Séparation de Gabon Éduc+

Cette base produit deux logiciels autonomes :

- **Gabon Éduc+ Primaire** : tous les établissements du primaire ;
- **Gabon Éduc+ Secondaire** : tous les établissements du secondaire.

## Socle commun conservé

Authentification, espaces Administration/Enseignant/Élève/Parent, élèves, personnel, classes, matières, évaluations, emplois du temps, assiduité, annonces, documents, synchronisation Supabase, fonctionnement hors ligne, permissions, abonnements, audit, imports/exports et tests.

## Règles de l’édition Primaire

- niveaux : 1ère à 5e Année ;
- matières et domaines du primaire ;
- barème de référence sur 10, seuil de réussite à 5 ;
- bulletin avec domaines/compétences et niveaux de maîtrise A à D ;
- aucun profil collège ou lycée proposé.
- aucune distinction public/privé.
- aucune passerelle ni ressource « Les Cahiers APC ».

## Règles de l’édition Secondaire

- niveaux réunis dans une seule progression : 6e, 5e, 4e, 3e, 2nde, 1re et Terminale ;
- barème de référence sur 20, seuil de réussite à 10 ;
- bulletin avec matières, coefficients, moyennes, rangs, statistiques, absences, appréciations et signatures ;
- aucun profil primaire proposé.
- aucune distinction collège/lycée ni public/privé.
- intégration de la passerelle et des ressources « Les Cahiers APC ».

## Compatibilité des anciennes données

Les anciennes valeurs techniques collège, lycée ou complexe restent reconnues à la lecture. Dans l’interface, elles sont regroupées sous l’unique catégorie Secondaire. Les statuts public et privé ne sont plus affichés ni demandés.

## Source d’autorité

L’établissement actif reste résolu à partir du compte et des memberships Supabase. Le stockage local conserve le mode hors ligne, mais ne peut pas rendre compatible un établissement appartenant à l’autre édition.

## Maintenance

Le fichier `lib/product-edition.ts` fixe l’identité du livrable. Les fonctions communes de `lib/school-profiles.ts` appliquent ensuite les profils, niveaux et matières autorisés. Les migrations historiques sont conservées sans modification.
