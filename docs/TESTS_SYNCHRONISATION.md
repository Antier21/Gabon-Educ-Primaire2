# Tests de synchronisation v0.9.1

Les tests couvrent file vide, ajout, dédoublonnage, succès, erreur, limite de cinq tentatives, annulation, conflit et résolutions. Ils vérifient aussi les métadonnées exactes des annonces, classes, élèves, absences, évaluations et documents, la persistance après rechargement et l’absence de faux succès en mode local.

Les tests de mapping contrôlent les noms de tables et de colonnes pour classes, élèves des deux stockages, responsables et liens, annonces, évaluations, assiduité, créneaux, documents, fiches, notes, utilisateurs, matières, affectations et paramètres. Ils interdisent la présence des clés enveloppes (`announcement`, `student`, `entry`, etc.) dans les lignes SQL.

Un test d’intégration place réellement des opérations avec `local/local-user` dans la file, exécute `processQueue` avec un client Supabase simulé, résout l’acteur authentifié et inspecte toutes les écritures. Il couvre l’annonce seule puis un lot issu des formulaires principaux, y compris le lien responsable-élève et la résolution matière/niveau d’une fiche. Un test séparé valide la migration 031 contre les incompatibilités historiques détectées.

## Audit des formulaires

Le test statique interdit `event.currentTarget.reset()` dans les gestionnaires asynchrones corrigés et exige une référence stable `const form = event.currentTarget`, suivie de `form.reset()`.

## Parcours manuel

1. En mode local, créer une annonce, classe, élève, absence, évaluation et document.
2. Vérifier module, opération, identifiant, date, état, tentatives et erreur dans le centre.
3. Publier l’annonce et vérifier la fusion cohérente avec sa création.
4. Recharger la page : les opérations doivent rester `En attente`.
5. Cliquer Annuler puis Réessayer sur des opérations distinctes.
6. Avec une instance Supabase de test, provoquer succès, erreur et conflit ; vérifier cinq tentatives maximum et l’absence de perte locale.

Ne jamais utiliser un bulletin verrouillé pour un test destructif. Les scénarios cloud restent à rejouer avec de vrais comptes et les policies RLS actives.

## Résultat automatisé final

- TypeScript : réussi, aucune erreur ;
- ESLint : réussi, aucune erreur ni aucun avertissement ;
- Vitest : 25 fichiers et 130 tests réussis sur 130 ;
- Next.js : build de production réussi, 35 pages statiques générées.

Le client Supabase simulé valide les requêtes et charges utiles produites. Il ne remplace pas une recette multi-utilisateurs sur une instance Supabase distante avec les RLS réellement déployées.
