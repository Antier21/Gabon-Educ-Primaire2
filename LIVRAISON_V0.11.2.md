# Gabon Éduc+ v0.11.2 — Personnel et création pédagogique des enseignants

## Direction et secrétariat → Personnel
Nouveau registre RH de tout le personnel employé : identité, contacts, matricule, fonction, service, contrat, embauche, qualifications, expérience, CNSS et informations administratives utiles.

## Pédagogie → Créer un enseignant
Un enseignant doit d'abord exister dans le registre du personnel avec la catégorie « Enseignant ». Le module crée ensuite son profil pédagogique et ouvre les affectations classe/matière. Au primaire, l'affectation du titulaire reste disponible ; au secondaire, l'affectation reste matière par matière.

## Séparation métier
- Recrutement / dossier employé ≠ compte utilisateur.
- Employé enseignant ≠ affectation pédagogique.
- Les autres personnels restent dans le registre RH sans devenir enseignants.

## Supabase
Nouvelle migration : `048_v0112_school_staff.sql`.
