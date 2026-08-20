# GABON Éduc+ v0.9.4 — sécurité des abonnements

## Ordre d’installation
1. Installer la v0.9.4 et recopier `.env.local`.
2. Exécuter `supabase/migrations/039_v094_security_hardening.sql`.
3. Lancer `npm install`, puis `npm run check`.

## Vérifications SQL
```sql
select * from public.list_subscription_guarded_tables();
select * from public.list_unguarded_school_tables();
```
La seconde requête doit renvoyer zéro ligne.

## Scénario obligatoire
1. Activer 30 jours.
2. Créer une annonce et une classe : autorisé.
3. Suspendre l’établissement.
4. Tenter annonce, classe, élève, évaluation, note et fiche pédagogique : refus avant écriture locale.
5. Vérifier que les anciennes données restent visibles.
6. Réactiver : les écritures redeviennent immédiatement possibles.

## Règles appliquées
- Supabase reste l’autorité finale grâce aux triggers.
- L’interface vérifie l’abonnement avant toute mutation locale principale.
- En cas d’échec de vérification cloud, le système se ferme par sécurité.
- Hors ligne, une validation récente de moins de 30 jours est exigée.
