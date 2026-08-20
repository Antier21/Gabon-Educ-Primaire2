# Étape 6.2 — Moteur pédagogique APC

Cette version conserve intégralement l’étape 5 et ajoute un moteur de génération différencié par discipline.

## Étape 5 incluse

Route : `/gabon-educ/mes-fiches`

Fonctions : recherche, filtres, modification, duplication, suppression, export JSON, accès à l’aperçu PDF depuis l’atelier.

## Étape 6.2

Route : `/gabon-educ/generateur-ia`

Le moteur adapte désormais :

- la compétence ;
- l’objectif ;
- la situation-problème ;
- les supports ;
- les phases pédagogiques ;
- les actions de l’enseignant ;
- les activités des élèves ;
- la trace écrite ;
- le devoir.

Les modèles sont spécialisés pour le français, les mathématiques, la physique-chimie, les SVT, l’histoire, la géographie, l’anglais, l’espagnol et la philosophie.

Le moteur fonctionne localement sans clé d’API. Une future étape pourra remplacer ou enrichir cette génération structurée par Claude ou OpenAI.
