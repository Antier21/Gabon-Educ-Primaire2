# Protocole de test — Notes et bulletins v0.7.0

## Portée

Ce protocole valide la première chaîne fonctionnelle : classes et élèves → périodes → matières → évaluations → notes → moyennes → appréciations → validation → impression/PDF.

Le document généré est un **modèle configurable de bulletin scolaire — à adapter aux exigences de l’établissement et aux textes officiels applicables**. Il n’est pas présenté comme homologué par le ministère gabonais.

## Tests automatisés obligatoires

Exécuter :

```bash
npm run test
```

Les suites `lib/grading/calculations.test.ts` et `lib/grading/store.test.ts` contrôlent :

- moyenne simple d’une évaluation ;
- moyenne pondérée par coefficient d’évaluation et de matière ;
- conversion d’une note lorsque le barème change ;
- coefficient nul ou invalide exclu du calcul ;
- valeur manquante, absence, dispense et non noté ;
- égalités de rang selon le classement de compétition (`1, 1, 3`) ;
- classement, moyenne de classe, meilleure et plus faible moyenne ;
- arrondi configurable, deux décimales par défaut ;
- génération du snapshot complet du bulletin ;
- refus des modifications sur période verrouillée ;
- conservation d’une copie figée après verrouillage ;
- droits locaux simulés pour appréciation générale, verrouillage et réouverture ;
- import et export CSV des notes.

Résultat attendu : **7 fichiers et 30 tests réussis**.

## Recette locale sans Supabase

1. Ouvrir `/gabon-educ/connexion` et choisir le mode démonstration.
2. Dans Mes classes, créer une classe et au moins deux élèves. Renseigner éventuellement matricule et date de naissance.
3. Ouvrir `/gabon-educ/notes-bulletins`.
4. Dans Paramètres, définir année, type de période, barème, seuil et arrondi. Laisser l’établissement vide pour tester le mode enseignant individuel.
5. Créer ou activer une période.
6. Sélectionner la classe, affecter au moins deux matières et leurs coefficients. Désactiver puis réactiver une matière.
7. Dans Notes, créer deux évaluations avec des barèmes et coefficients différents.
8. Saisir les notes ; marquer un élève absent, dispensé ou non noté et vérifier qu’aucune note fictive n’est ajoutée.
9. Recharger la page : les brouillons doivent rester présents sans chargement infini.
10. Exporter le CSV, modifier une ligne dans le format fourni puis le réimporter.
11. Dans Bulletins, vérifier moyennes par matière, pondérations, moyenne générale, rangs, statistiques et nombre d’évaluations.
12. Avec le rôle simulé Professeur principal, saisir appréciations, travail, conduite, assiduité, décision et mention.
13. Avec le rôle Administration ou Chef d’établissement, passer le bulletin à Validé puis Verrouillé.
14. Modifier ensuite une note source après réouverture de la période : le bulletin verrouillé doit conserver son ancien snapshot.
15. Rouvrir le bulletin avec un rôle autorisé et vérifier le retour à l’état À vérifier.

## Impression et PDF

1. Ouvrir l’aperçu individuel puis cliquer sur **Imprimer / PDF**.
2. Vérifier le format A4, l’absence de navigation et de boutons, la lisibilité en couleur et en niveaux de gris, et l’absence de débordement horizontal.
3. Choisir **Enregistrer au format PDF** dans le navigateur.
4. Cliquer sur **Toute la classe** et vérifier un saut de page par élève.
5. Vérifier que le logo configuré est conservé et qu’aucun texte important n’est coupé.

## Recette Supabase et sécurité

Après application des migrations 001 à 011 :

1. utiliser deux comptes enseignants ;
2. affecter des classes et matières distinctes ;
3. vérifier par requêtes directes que chaque enseignant ne lit ni ne modifie les notes de l’autre ;
4. vérifier les accès du professeur principal et de l’administration selon les affectations ;
5. verrouiller une période avec un compte autorisé et vérifier le refus des écritures ;
6. contrôler la présence du snapshot JSON des bulletins verrouillés.

La simulation de rôles du mode local ne doit jamais être considérée comme une sécurité serveur.
