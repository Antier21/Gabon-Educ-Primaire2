# Gabon Educ+ v0.10.3 — modèles de documents scolaires

Cette version ajoute une première base de modèles de documents scolaires inspirés des documents fournis par Antier.

## Modèles intégrés

1. **Fiche d’identification de l’élève**
   - identité de l’élève ;
   - informations de l’établissement ;
   - statut public / privé ;
   - ordre d’enseignement ;
   - signatures de l’apprenant, du parent et du chef d’établissement.

2. **Bulletin annuel du primaire**
   - notes sur 10 ;
   - domaines : Français, Anglais, Mathématiques, EDM/EAS ;
   - niveau de maîtrise A, B, C, D ;
   - total, moyenne générale, rang et appréciation.

3. **Bulletin trimestriel du secondaire général**
   - matières ;
   - coefficient ;
   - rang ;
   - moyenne de l’élève ;
   - moyenne de classe ;
   - minimum et maximum ;
   - absences ;
   - appréciations et signatures.

## Règles par type d’établissement

- École primaire : fiche d’identification + bulletin annuel primaire.
- Collège général : fiche d’identification + bulletin trimestriel secondaire.
- Lycée général : fiche d’identification + bulletin trimestriel secondaire.
- Complexe scolaire : les trois modèles sont disponibles.

## Limites actuelles

Les modèles sont imprimables et exploitent les informations disponibles dans le dossier élève, la classe et l’établissement. Les valeurs de notes utilisées dans les aperçus des documents scolaires sont encore des valeurs de démonstration dans le module Documents. Les bulletins réellement calculés restent produits depuis le module Notes & bulletins.

La prochaine étape consistera à connecter les modèles de documents aux données réelles de notes, de périodes, de paliers, de rangs et d’appréciations.
