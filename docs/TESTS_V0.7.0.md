# Tests et recette — Gabon Éduc+ v0.7.0

## Contrôles automatisés

Commandes exécutées :

```bash
npm install
npm test
npm run lint
npm run typecheck
npm run build
```

Résultat de la dernière exécution complète :

- 5 fichiers de tests réussis ;
- 13 tests réussis ;
- ESLint : aucune erreur ;
- TypeScript : aucune erreur ;
- compilation Next.js : réussie ;
- 16 pages générées.

Contrôle HTTP en mode démonstration : les 11 routes principales ont répondu avec le statut `200`.

## Protocole de test utilisateur

1. Ouvrir `/gabon-educ`, puis créer un compte ou choisir la démonstration.
2. Vérifier l’accès au tableau de bord et l’étiquette du mode de stockage.
3. Créer une classe, modifier son nom, ajouter puis modifier un élève.
4. Rechercher cet élève, exporter la liste CSV, puis tester un import CSV.
5. Créer une fiche dans l’atelier, l’enregistrer en brouillon, la finaliser et l’ouvrir dans Mes fiches.
6. Dupliquer, filtrer et exporter la fiche.
7. Créer une évaluation avec plusieurs types de questions et vérifier le total des points.
8. Enregistrer en brouillon, dupliquer, finaliser et ouvrir l’impression du sujet et du corrigé.
9. Ouvrir Programmes APC, filtrer une notion et l’envoyer vers l’atelier puis vers le moteur pédagogique.
10. Modifier le profil dans Paramètres et vérifier les données du tableau de bord.
11. Réduire la fenêtre aux largeurs téléphone et tablette ; vérifier menus, formulaires et tableaux.
12. Parcourir formulaires et boutons avec la touche Tab, puis valider avec Entrée ou Espace.
13. Couper le réseau pendant une sauvegarde ; vérifier le message de synchronisation différée et la présence des données après rechargement.
14. Rétablir le réseau et, avec Supabase configuré, vérifier la reprise.

## Risques à surveiller

- migrations non exécutées ou exécutées dans le désordre ;
- URL de redirection Supabase incorrecte ;
- blocage des fenêtres d’impression par le navigateur ;
- CSV utilisant des colonnes différentes de `Nom;Prénom;E-mail` ;
- contenu APC non validé importé comme `published` par erreur ;
- tests multi-appareils impossibles sans projet Supabase distant réel.
