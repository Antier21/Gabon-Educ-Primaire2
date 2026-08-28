# Comptabilité et frais de scolarité

## Objectif et périmètre

Ce module suit les frais réclamés aux élèves, les échéances, encaissements partiels ou complets, reçus, impayés, situations familiales, annulations contrôlées et clôtures journalières. Tous les montants sont des entiers FCFA.

Il ne constitue pas une comptabilité générale : aucun plan comptable, dépense, bilan, fiscalité, paie, banque, rapprochement ou paiement mobile automatisé n’est inclus. Airtel Money et Moov Money sont uniquement des moyens d’encaissement déclaratifs.

## Rôles

- `school_admin` et `headmaster` : configuration, encaissement, annulation, clôture et consultation.
- `secretary` : consultation, encaissement, reçus et clôture de sa caisse ; aucune configuration ni annulation définitive.
- `guardian` : lecture de ses seuls enfants lorsque la publication est activée.
- Les autres rôles n’accèdent pas au module administratif.
- `super_admin` conserve le comportement de support de `RequireRole`, mais les RLS ne lui accordent pas implicitement une lecture transversale des tables financières.

## Modèle de données

La migration `100_finance_scolarite.sql` crée onze tables `finance_` isolées par `school_id` : paramètres, types de frais, barèmes hiérarchiques, échéanciers, frais figés par élève, paiements, affectations, séquences de reçus et clôtures. La table de demandes d’annulation a été retirée : aucun parcours incomplet n’est annoncé. Un frais attribué est un instantané et aucun historique financier ne possède de policy `DELETE`.

La priorité de barème est : élève, classe, niveau, établissement. `finance_winning_scale` applique cette priorité côté PostgreSQL pour chaque combinaison établissement/année/type/élève, indépendamment de l’ordre d’application. Un barème général ne facture pas un élève couvert par un barème plus précis. Une ancienne charge issue d’un autre barème devient un conflit explicite et n’est jamais remplacée automatiquement, qu’elle ait déjà reçu un paiement ou non.

## Encaissement et numérotation

L’utilisateur recherche l’élève, choisit une échéance, saisit le payeur, le montant entier et le moyen, puis confirme. `record_finance_payment` vérifie la session, le rôle, l’établissement, l’année, l’élève, le solde et l’égalité des affectations. Le paiement, ses affectations et le reçu sont créés dans la même transaction PostgreSQL.

La séquence est verrouillée atomiquement par établissement et année civile. Format : `PRÉFIXE-AAAA-000001`. L’unicité porte sur `(school_id, receipt_number)` : deux écoles peuvent donc avoir chacune `REC-2026-000001`. Un numéro annulé n’est jamais réutilisé. Un verrou transactionnel par clé d’idempotence précède la séquence ; une répétition identique retourne le paiement existant et une répétition différente est refusée.

Toutes les dates de caisse sont calculées dans `Africa/Libreville` : journée `(horodatage at time zone 'Africa/Libreville')::date` et année du reçu extraite dans ce même fuseau. Un paiement entre 00 h 00 et 00 h 59 à Libreville appartient donc bien à la nouvelle journée, y compris au passage du 31 décembre.

Les échéances sont verrouillées par UUID croissant avec `FOR UPDATE` avant le recalcul des soldes. Paiement, clôture et annulation prennent aussi le même verrou transactionnel `school_id:cashier_id:cash_day_Libreville`. Pour le test concurrent de préproduction, ouvrir deux sessions SQL authentifiées comme le même caissier, démarrer deux transactions, appeler simultanément `record_finance_payment` sur la même échéance dont le solde ne couvre qu’un appel, puis valider : un seul appel doit réussir, l’autre doit attendre puis être refusé pour dépassement. Refaire avec la même clé d’idempotence : les deux appels doivent retourner le même paiement et un seul numéro doit être consommé.

## Annulation et clôture

Une annulation n’efface rien. Elle exige un motif, conserve le reçu et le montant, marque le paiement `cancelled`, enregistre auteur/date et écrit l’audit. Seuls `school_admin` et `headmaster` peuvent la valider.

Une clôture agrège la journée et les moyens de paiement pour un caissier. Une date future est refusée ; le secrétariat clôture uniquement sa caisse et la direction peut clôturer celle d’un caissier actif de son établissement. La contrainte `(school_id, cash_date, cashier_id)` interdit une double clôture et tout encaissement ultérieur du caissier ce jour-là est refusé. Une annulation postérieure apparaît séparément sur la consultation et l’impression sans réécrire le total historique.

## Espace parent

La rubrique appelle uniquement `get_my_parent_finance_summary(target_school)`. Cette RPC vérifie `auth.uid()`, le responsable actif, les liens avec ses enfants, la publication générale et `publish_to_parents` pour chaque barème. Elle ne retourne que l’identité minimale de l’enfant, les frais publiés et les reçus visibles ; aucun commentaire, référence externe, caissier ou motif interne n’est exposé. Les policies de lecture directe des tables financières sont réservées au personnel. Rien n’est ajouté à l’espace élève.

## Migration et ordre de déploiement

La migration `100_finance_scolarite.sql` a été appliquée avec succès. Le contrôle post-migration a confirmé les 11 tables financières, la RLS sur chacune, toutes les fonctions attendues, aucune exposition à `anon` ou `PUBLIC`, aucun privilège `authenticated` incorrect et aucune policy `ALL` ou `DELETE` dangereuse. Aucune donnée financière n’existait au moment du contrôle.

Deux corrections de privilèges ont ensuite été exécutées manuellement. La migration idempotente `101_finance_internal_function_privileges.sql` est requise dans l’historique Git pour reproduire exactement cet état final : quatre fonctions internes sans droit client et dix RPC applicatives exécutables uniquement par `authenticated`. Elle doit être appliquée sur tout nouvel environnement après la migration 100.

## Contrôles SQL préalables en lecture seule

Exécuter dans SQL Editor avant la migration 100. Ces requêtes ne modifient rien.

```sql
select table_name from information_schema.tables where table_schema='public' and table_name in
 ('schools','academic_years','grade_levels','class_groups','student_records','guardians','guardian_student_links','school_memberships','school_audit_events') order by table_name;

select table_name,column_name,data_type,udt_name from information_schema.columns where table_schema='public'
 and table_name in ('schools','academic_years','grade_levels','class_groups','student_records','guardians','guardian_student_links','school_memberships','school_audit_events')
 and column_name in ('id','school_id','academic_year_id','grade_level_id','class_group_id','student_id','guardian_id','profile_id','user_id','role','status','audit_action','module','entity_id','before_data','after_data','event_status')
 order by table_name,ordinal_position;

select distinct role::text from public.school_memberships order by 1;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef security_definer
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('belongs_to_school','has_school_role','is_super_admin','set_updated_at');
select count(*) link_count,count(distinct guardian_id) guardians,count(distinct student_id) students from public.guardian_student_links;
select school_id,id,label,starts_on,ends_on from public.academic_years where is_current and not coalesce(is_archived,false) order by school_id;
```

Vérifier que les neuf tables préexistantes sont présentes, que les clés sont des UUID compatibles, que les rôles attendus existent et qu’une seule année active pertinente existe par établissement.

## Contrôles SQL après migration

```sql
select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and relname like 'finance_%' and relkind='r' order by relname;

select tablename,policyname,cmd,roles,qual,with_check from pg_policies
 where schemaname='public' and tablename like 'finance_%' order by tablename,policyname;

select p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef,
 pg_get_functiondef(p.oid) like '%SET search_path TO public%' explicit_search_path
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like '%finance%' order by p.proname;

select routine_name,grantee,privilege_type from information_schema.routine_privileges
 where specific_schema='public' and routine_name like '%finance%' order by routine_name,grantee;

select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename like 'finance_%' order by tablename,indexname;
select conrelid::regclass table_name,conname,contype,pg_get_constraintdef(oid) definition from pg_constraint
 where connamespace='public'::regnamespace and conrelid::regclass::text like 'finance_%' order by 1,2;

select table_name,privilege_type,grantee from information_schema.role_table_grants
 where table_schema='public' and table_name in ('finance_payments','finance_cash_closures') and privilege_type='DELETE';
```

Résultat obtenu après migration 100 et correctifs de privilèges reproduits par la migration 101 : 11 tables financières avec RLS active ; aucune table ou fonction manquante ; policies sans `using (true)`, `FOR ALL` ou `DELETE` ; fonctions sensibles `SECURITY DEFINER` avec `search_path=public` ; aucune fonction exposée à `anon` ou `PUBLIC` ; seules les dix RPC applicatives accordées à `authenticated` ; aucun droit ordinaire de suppression sur l’historique financier.

## Procédure SQL Editor adaptée à la production

1. Effectuer une sauvegarde Supabase vérifiée et noter son identifiant.
2. Exécuter les contrôles préalables ci-dessus en lecture seule.
3. Sur un nouvel environnement seulement, appliquer `100_finance_scolarite.sql`, puis `101_finance_internal_function_privileges.sql` dans cet ordre.
4. Exécuter immédiatement les contrôles après les deux migrations et conserver les résultats.
5. Exécuter les tests fonctionnels sur un compte de direction, un secrétaire et un parent avant ouverture générale.
6. Après validation de la base, committer et pousser le code applicatif.
7. Déployer sur Netlify.
8. Rejouer la checklist fonctionnelle en ligne pour chaque rôle et deux établissements distincts.

`supabase db reset` ne fait pas partie de la procédure en ligne.

## Retour arrière

Le retour applicatif consiste à redéployer la version précédente et à retirer l’entrée de navigation. Les tables financières doivent être conservées pour l’audit. Une suppression de schéma, si elle devait un jour être décidée, doit faire l’objet d’une migration séparée, d’une sauvegarde et d’une autorisation explicite ; elle ne fait pas partie de cette livraison.

## Tests manuels

- Configurer un type, un barème et un échéancier avec un compte de direction.
- Vérifier que le secrétariat les consulte mais ne les modifie pas.
- Affecter un frais, enregistrer deux paiements partiels et imprimer chaque reçu en A4 et 80 mm.
- Refuser un trop-perçu et un double clic.
- Annuler avec la direction et vérifier `ANNULÉ`, le solde et l’audit.
- Clôturer chaque caisse, puis vérifier le refus d’une seconde clôture.
- Après clôture, vérifier le refus d’un nouvel encaissement et l’affichage séparé d’une annulation postérieure.
- Exécuter le scénario concurrent à deux sessions décrit dans « Encaissement et numérotation ».
- Dans deux sessions, mettre en concurrence encaissement/clôture puis annulation/clôture : le premier détenteur du verrou doit déterminer sans ambiguïté le contenu historique de la clôture.
- Tester à `23:30 UTC` le rattachement à la journée suivante de Libreville et, le 31 décembre, à la nouvelle année de reçu.
- Créer successivement des barèmes établissement, niveau, classe et élève dans plusieurs ordres ; vérifier les compteurs `overshadowed_count` et `conflict_count` et l’absence de remplacement d’une ancienne charge payée.
- Activer/désactiver la publication parent et vérifier deux familles distinctes.
- Vérifier qu’enseignant, vie scolaire, parent et élève ne peuvent ouvrir l’administration financière.
