# Tests v0.8.0

## Automatisés

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

Les suites couvrent les moyennes/barèmes historiques, snapshots de bulletins, rôles, isolation d’établissement, affectations enseignantes, conflits d’emploi du temps, assiduité, liens parent-enfant, transferts, documents, stockage local, reprise de synchronisation, migration sans doublon et RLS des migrations 012–022.

## Recette manuelle

1. Entrer en démonstration et ouvrir `/gabon-educ/etablissement`.
2. Configurer l’établissement et confirmer ou refuser la reprise v0.7.0.
3. Créer un utilisateur, un élève, un responsable et leur lien.
4. Créer une matière, l’affecter, puis deux créneaux qui se chevauchent.
5. Enregistrer une absence et publier une annonce.
6. Générer un document, imprimer, puis vérifier l’absence des contrôles à l’impression.
7. Saisir des notes, calculer et verrouiller un bulletin ; modifier une note source et vérifier que le snapshot archivé ne change pas.
8. Parcourir toutes les routes protégées avec la session de démonstration et vérifier un HTTP 200.
