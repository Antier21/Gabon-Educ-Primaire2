# GABON Éduc+ v0.9.3 — sécurisation des écritures

## Installation

1. Conserver la migration 037 déjà exécutée.
2. Dans Supabase > SQL Editor > New query, copier tout le fichier :
   `supabase/migrations/038_v093_subscription_write_guards.sql`
3. Cliquer sur **Run**.
4. Résultat attendu : `Success. No rows returned`.

## Vérification des tables protégées

Exécuter ensuite :

```sql
select * from public.list_subscription_guarded_tables();
```

La liste doit contenir les tables métier qui possèdent `school_id`.

## Test fonctionnel obligatoire

1. Activer l’établissement.
2. Créer un élément test (par exemple une annonce).
3. Suspendre l’établissement depuis Service abonnements.
4. Actualiser la page.
5. Tenter une nouvelle création ou modification : elle doit être refusée avec un message d’abonnement.
6. Vérifier que les anciennes données restent consultables.
7. Réactiver 30 jours et confirmer que l’écriture refonctionne.
