# Gabon Éduc+ v0.9.1

Plateforme pédagogique et de gestion d’établissement, conçue pour fonctionner avec Next.js, TypeScript et Supabase, tout en conservant un mode local démontrable sans configuration distante.

## Modules disponibles

- pédagogie APC, fiches de cours et évaluations ;
- `Mes classes` via l’implémentation officielle `ClassesManagerLocal` ;
- notes, moyennes, appréciations, bulletins A4 et snapshots verrouillés ;
- établissement, années, périodes et niveaux ;
- utilisateurs, invitations, rôles et périmètres ;
- dossiers élèves, parents et liens responsables-enfants ;
- matières, coefficients et affectations ;
- emplois du temps avec détection de conflits ;
- assiduité, annonces, documents et espaces parent/élève.
- file hors ligne, synchronisation Supabase, résolution explicite des conflits ;
- audit local, notifications, import/export CSV, sauvegardes et diagnostic.

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir `http://localhost:3000/gabon-educ`. Sans variables Supabase complètes, l’application passe en mode local sans chargement infini. Le sélecteur de rôle local sert à tester l’interface ; il ne simule pas une sécurité serveur.

## Contrôle complet

```bash
npm run check
```

La commande exécute les tests, ESLint, TypeScript et le build de production. Pour Gabon Éduc+ Primaire, les migrations Supabase `001` à `059` doivent être appliquées dans l’ordre. Si la maternelle a déjà été activée avec `058_preschool_levels.sql`, appliquer ensuite `059_preschool_grading_persistence.sql` afin de synchroniser les domaines, observations et niveaux de maîtrise.

## Documentation

- `docs/ARCHITECTURE_V0.9.0.md`
- `docs/INSTALLATION_V0.9.0.md`
- `docs/SUPABASE_V0.9.0.md`
- `docs/RLS_V0.9.0.md`
- `docs/ROLES_ET_PERMISSIONS.md`
- `docs/TESTS_V0.9.0.md`
- `docs/MIGRATION_V0.8_VERS_V0.9.md`
- `LIVRAISON_V0.9.1.md`

> Modèle configurable de bulletin scolaire — à adapter aux exigences de l’établissement et aux textes officiels applicables.
