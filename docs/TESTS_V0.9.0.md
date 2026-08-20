# Protocole de tests v0.9.0

## Automatisation

Exécuter sur Node 20 :

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

La suite conserve les 53 tests v0.8.0 et couvre en plus synchronisation, conflits, imports, notifications, audit, sauvegarde, diagnostic, migrations et états de session. Conserver les sorties exactes dans le rapport de livraison.

## Parcours manuel

1. créer établissement, année, période, classe et élève ;
2. rattacher parent et enseignant ;
3. créer emploi du temps et provoquer un conflit ;
4. saisir absence, évaluation et notes ;
5. générer, valider et publier un bulletin, puis consulter comme parent ;
6. couper le réseau, modifier, rétablir et synchroniser ;
7. provoquer puis résoudre un conflit ;
8. importer/exporter un CSV ;
9. sauvegarder, prévisualiser et restaurer ;
10. vérifier audit, notifications, diagnostic et affichage téléphone.

Pour chaque étape, consigner navigateur, rôle, données utilisées, attendu, obtenu et capture éventuelle. Les scénarios cloud/RLS doivent être réalisés sur une instance Supabase : ils ne sont pas déclarés réussis par les seuls tests locaux.
