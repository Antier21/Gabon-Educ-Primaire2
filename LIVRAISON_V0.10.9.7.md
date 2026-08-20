# Gabon Éduc+ v0.10.9.7 — verrouillage du contexte établissement

## Cause confirmée
Au premier rendu, certains formulaires utilisaient un niveau par défaut avant la résolution asynchrone de l’établissement. Puis Supabase pouvait sélectionner un ancien établissement autorisé du compte, même s’il ne correspondait pas au profil récemment choisi. Cela expliquait le phénomène observé : 6e visible quelques secondes, puis CP1–CM2.

## Corrections
- aucun niveau n’est affiché tant que l’établissement actif n’est pas résolu ;
- le profil choisi/enregistré est conservé sous forme de contrainte `expected-school-profile` ;
- Supabase ne peut plus retomber silencieusement sur un établissement d’un autre type/secteur ;
- priorité : schoolId explicitement enregistré, puis activeSchool, puis workspace, mais uniquement parmi les établissements correspondant au profil attendu ;
- si aucun établissement correspondant n’est associé au compte, une erreur explicite est produite ;
- si Supabase est configuré mais que l’enregistrement cloud échoue, le formulaire ne simule plus un succès local et ne redirige plus vers un ancien établissement ;
- les formulaires Classes et Inscriptions ne fabriquent plus un profil collège pendant le chargement.

## Migration
Aucune nouvelle migration SQL. La migration 046 reste applicable.
