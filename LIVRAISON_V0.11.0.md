# Gabon Éduc+ v0.11.0 — Génération automatique des emplois du temps V1

## Objectif
Première version exploitable du moteur automatique d’emplois du temps, construite sur la v0.10.10.1.

## Contrôles avant génération
Le module vérifie désormais :
- établissement actif Supabase ;
- année scolaire active ;
- classes de l’établissement ;
- matières actives ;
- volume hebdomadaire de chaque matière affectée ;
- affectations classe–matière–enseignant ;
- enseignants actifs ;
- doublons d’affectation.

Le bouton de génération reste désactivé tant qu’une donnée obligatoire manque et l’écran indique les éléments à compléter.

## Contraintes du moteur V1
- aucune classe ne peut avoir deux cours simultanément ;
- aucun enseignant ne peut avoir deux cours simultanément ;
- une salle renseignée ne peut pas être utilisée deux fois simultanément ;
- les créneaux déjà saisis sont conservés ;
- seuls les créneaux manquants sont générés ;
- le moteur respecte le volume hebdomadaire configuré ;
- les matières sont réparties autant que possible sur plusieurs jours ;
- les journées des classes et enseignants sont équilibrées par une heuristique simple ;
- toutes les données sont limitées à l’établissement actif et à l’année scolaire active.

## Limites V1
- les indisponibilités individuelles des enseignants ne sont pas encore configurables ;
- les préférences pédagogiques avancées (matières prioritaires le matin, pauses, blocs de 2 h, etc.) viendront dans une V2 ;
- le volume `Heures/semaine` est converti en nombre entier de créneaux selon les créneaux horaires actuels.

## Migration Supabase
Aucune nouvelle migration n’est nécessaire pour cette version.
