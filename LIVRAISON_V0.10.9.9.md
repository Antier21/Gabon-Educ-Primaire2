# Gabon Éduc+ v0.10.9.9

## Correctif : création et affichage des classes

Cette version corrige le cas où une classe est bien créée dans `class_groups` (HTTP 201) mais n’apparaît pas dans l’écran **Mes classes** après l’enregistrement.

### Cause traitée
Le composant résolvait l’établissement actif, puis `listClasses()` et `saveClassRecord()` relisaient séparément `activeSchool` depuis le stockage local. Si ce contexte variait entre la création et le rechargement, la classe pouvait être enregistrée sous un `school_id` valide mais la liste être relue avec un autre établissement.

### Modifications
- ajout d’un `ClassSchoolContext` explicite (`schoolId`, `schoolType`) dans `lib/class-store.ts` ;
- `listClasses()` interroge désormais `class_groups` avec le `school_id` explicitement résolu par l’écran ;
- `saveClassRecord()` utilise exactement le même `school_id` et le même type d’établissement pendant toute l’opération ;
- le contexte est transmis à la détection des doublons et au cache local ;
- mise à jour optimiste de la liste après création : la nouvelle classe apparaît immédiatement ;
- relecture Supabase ensuite pour confirmer l’état synchronisé ;
- aucune modification des règles Primaire / Collège / Lycée dans cette livraison.

### Migration Supabase
Aucune nouvelle migration. La migration 047 reste la dernière migration requise.

### Vérifications
- intégrité des fichiers modifiés vérifiée ;
- archive ZIP générée et contrôlée ;
- `npm run typecheck` n’a pas pu être exécuté utilement dans l’environnement de livraison car `node_modules` n’est pas présent. Les erreurs obtenues sont principalement des modules/types manquants (`next`, `react`, `@supabase/*`, `vitest`, etc.).

### Test utilisateur attendu
1. Ouvrir **Mes classes** dans un établissement primaire.
2. Créer plusieurs classes successives (ex. CP1 A, CP1 B, CE1 A).
3. Chaque classe doit apparaître immédiatement après Enregistrer.
4. Après actualisation de la page, toutes les classes doivent rester visibles.
5. Le bandeau doit afficher `Classes synchronisées` lorsque toutes les écritures Supabase ont réussi.
