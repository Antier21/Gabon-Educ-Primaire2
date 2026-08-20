# Gabon Éduc+ v0.11.7

## Correctifs
- Ajout de la migration 049 pour créer `school_staff.pedagogical_user_id` si elle manque et recharger le cache PostgREST.
- Le lien RH → profil pédagogique ne fait plus échouer le chargement global une fois la migration appliquée.
- Les compteurs de classes des tableaux de bord chargent d'abord les classes depuis l'établissement actif mémorisé, puis confirment avec le contexte Supabase.
- Le compteur de classes ne dépend plus du succès du chargement complet du module pédagogique.

## Migration
Exécuter `supabase/migrations/049_v0117_staff_pedagogical_link.sql`.
