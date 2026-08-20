# Configuration Supabase — v0.7.0

## 1. Créer le projet

Créer un projet Supabase, conserver le mot de passe PostgreSQL et activer le fournisseur d’authentification par e-mail. En production, conserver la confirmation de l’adresse e-mail.

## 2. Exécuter les migrations

Dans l’éditeur SQL ou avec la CLI Supabase, appliquer strictement :

1. `001_schema_initial.sql`
2. `002_authentification_rls.sql`
3. `003_lesson_plan_workshop.sql`
4. `004_stabilisation_lesson_payloads.sql`
5. `005_mes_classes.sql`
6. `006_profils_classes_connectes.sql`
7. `007_evaluations_connectees.sql`
8. `008_indexation_programmes.sql`

Ne jamais modifier une migration déjà appliquée. Les évolutions suivantes devront commencer à `009`.

## 3. Variables publiques

Créer `.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://VOTRE-PROJET.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=VOTRE_CLE_PUBLIQUE
```

Ne jamais ajouter `service_role` dans le projet client, dans GitHub ou dans une variable commençant par `NEXT_PUBLIC_`.

## 4. Adresses de redirection

Dans **Authentication → URL Configuration**, enregistrer :

- `http://localhost:3000`
- l’adresse publique exacte de Gabon Éduc+.

## 5. Contrôles manuels

1. créer deux comptes enseignants ;
2. vérifier la création automatique de chaque ligne `profiles` et du rôle `teacher` ;
3. créer une fiche, une classe et une évaluation avec le premier compte ;
4. vérifier que le second compte ne peut lire, modifier ou supprimer aucune de ces données ;
5. interrompre le réseau, créer un brouillon et vérifier sa conservation locale ;
6. rétablir le réseau et vérifier la synchronisation différée ;
7. se connecter sur un second appareil et vérifier le chargement des données cloud.

## 6. Données de programmes

Les tables `curricula`, `curriculum_units`, `competencies`, `learning_objectives` et `weekly_progressions` reçoivent uniquement des contenus sourcés. Une progression n’est affichée comme officielle que si son curriculum possède le statut `published`.
