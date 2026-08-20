# Gabon Éduc+ — Étape 2 : connecter Supabase

## Résultat de cette étape

Après l’exécution des deux fichiers SQL, Gabon Éduc+ disposera de :

- l’inscription par adresse e-mail et mot de passe ;
- la connexion sécurisée ;
- la création automatique du profil ;
- l’attribution initiale d’un rôle autorisé ;
- la protection des fiches pédagogiques par propriétaire ;
- la lecture des programmes officiels publiés ;
- une base prête à être connectée à l’interface du site.

## 1. Créer le projet Supabase

1. Ouvrir le tableau de bord Supabase.
2. Créer un nouveau projet nommé `gabon-educ-plus`.
3. Choisir un mot de passe de base de données fort et le conserver en lieu sûr.
4. Choisir la région disponible la plus proche des utilisateurs ciblés.
5. Attendre l’ouverture du tableau de bord du projet.

## 2. Installer la base

Dans **SQL Editor**, exécuter les fichiers dans cet ordre :

1. `gabon_educ_plus_schema.sql`
2. `gabon_educ_plus_supabase_auth_rls.sql`

Ne pas inverser l’ordre.

## 3. Configurer l’authentification

Dans **Authentication → Providers → Email** :

- activer l’inscription par e-mail ;
- conserver la confirmation d’e-mail pour la production ;
- elle peut être désactivée uniquement pendant les premiers tests locaux.

Dans **Authentication → URL Configuration** :

- Site URL de développement : `http://localhost:3000`
- URL publique future : l’adresse exacte de Gabon Éduc+ sur cahiers.gaboneducplus.com

## 4. Données envoyées lors de l’inscription

L’interface devra transmettre les métadonnées suivantes :

```javascript
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      first_name: prenom,
      last_name: nom,
      display_name: `${prenom} ${nom}`,
      phone,
      role: "teacher"
    }
  }
});
```

Les rôles librement sélectionnables au départ sont :

- `teacher`
- `student`
- `parent`

Les rôles `super_admin`, `inspector` et `school_admin` ne doivent jamais être attribués depuis un formulaire public.

## 5. Premier compte administrateur

Créer d’abord un compte normal depuis l’interface Supabase ou le futur formulaire. Puis exécuter dans SQL Editor en remplaçant l’adresse :

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.user_role
from auth.users
where email = 'VOTRE_ADRESSE_EMAIL'
on conflict do nothing;
```

Le compte peut conserver aussi son rôle `teacher`.

## 6. Variables nécessaires dans l’application

Dans **Project Settings → API**, récupérer :

- Project URL ;
- clé publique `anon` ou `publishable`.

Elles seront utilisées dans l’application sous cette forme :

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

La clé `service_role` ne doit jamais être placée dans le navigateur ni publiée sur GitHub.

## 7. Test minimum à réaliser

1. Créer un compte enseignant.
2. Vérifier qu’une ligne apparaît dans `profiles`.
3. Vérifier qu’un rôle `teacher` apparaît dans `user_roles`.
4. Se connecter avec ce compte.
5. Créer une fiche dans `lesson_plans` avec son propre identifiant comme `teacher_id`.
6. Vérifier qu’un autre compte ne peut ni modifier ni supprimer cette fiche.

## Étape suivante

Construire l’interface d’inscription et de connexion, puis le premier tableau de bord Enseignant avec :

- choix de la matière ;
- choix du niveau ;
- liste des fiches déjà créées ;
- bouton **Créer une fiche pédagogique**.
