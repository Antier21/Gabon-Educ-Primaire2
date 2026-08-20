# Architecture de Gabon Éduc+ v0.7.0

## Principe hybride

Chaque écriture pédagogique suit le même ordre :

1. validation des données ;
2. sauvegarde locale immédiate ;
3. détection réelle de la session Supabase ;
4. tentative cloud avec délai maximal ;
5. confirmation `synced` ou maintien `pending` ;
6. reprise ultérieure sans suppression de la copie locale.

Les modes sont :

- `cloud` : variables présentes, utilisateur authentifié, service joignable ;
- `demo` : Supabase absent ou aucune session cloud ;
- `offline` : service configuré, mais temporairement indisponible.

## Couches principales

- `lib/storage-mode.ts` : détection, délais et clés locales versionnées ;
- `lib/lesson-store.ts` : fiches et migration locale/cloud ;
- `lib/class-store.ts` : classes, élèves et CSV ;
- `lib/evaluation-store.ts` : sujets, questions, barèmes et synchronisation ;
- `lib/profile-store.ts` : profil et déconnexion ;
- `lib/program-store.ts` : progressions Supabase ou exemples non officiels.

Les composants présentent les données et délèguent la persistance à ces couches. Les nouveaux gros écrans utilisent des CSS Modules. Le site historique du dossier `public/` n’est pas modifié.

## Sécurité

Supabase Auth identifie l’enseignant. Les politiques RLS limitent les lignes au propriétaire. Les élèves du module Mes classes sont des enregistrements pédagogiques et ne nécessitent pas de compte Auth.

## Évolutivité

`teacher_evaluations.payload` conserve la structure complète tout en exposant les colonnes utiles aux filtres. Cette organisation permet d’ajouter plus tard notes, copies, statistiques et génération assistée sans réécrire l’éditeur actuel.
