# Livraison Gabon Éduc+ v0.8.0

## Périmètre livré

La base officielle v0.7.0 a été conservée, y compris `ClassesManagerLocal`, la chaîne bulletins et les migrations 001–011. La v0.8.0 ajoute la plateforme établissement, ses routes, ses fonctions locales, ses permissions, les migrations 012–022 et la documentation de test.

## Contrôles attendus

- `package.json` en version 0.8.0 ;
- branche `codex/v0.8.0-plateforme-etablissement` ;
- tests, lint, typecheck et build au vert ;
- test HTTP de toutes les routes protégées ;
- archive sans `.next`, `node_modules` ni historique Git ;
- aucun secret applicatif dans l’archive.

## Résultats de vérification

- `npm run check` : réussi ;
- tests : 53 réussis dans 12 suites ;
- ESLint : réussi sans avertissement ;
- TypeScript : réussi ;
- build Next.js : 29 pages générées ;
- recette HTTP : 24 routes contrôlées, toutes en HTTP 200 avec la session de démonstration ;
- migrations 001–011 : empreintes identiques à la base officielle validée ;
- publication GitHub : non exécutée dans cet environnement, car le CLI obligatoire `gh` n’y est pas installé.

## Limites explicites

Le mode local permet une démonstration fonctionnelle, mais ne constitue pas une sécurité serveur. L’envoi d’e-mails, les fichiers téléversés et la validation réglementaire des modèles nécessitent une intégration de production. Le bulletin porte la mention : « Modèle configurable de bulletin scolaire — à adapter aux exigences de l’établissement et aux textes officiels applicables. »
