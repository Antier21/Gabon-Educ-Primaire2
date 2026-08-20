# Gabon Éduc+ v0.10.9.2 — Rétablissement des accès + génération automatique V1

## Accès corrigés
- la connexion par identifiant résout désormais l'adresse technique réellement stockée dans Supabase, même sans `SUPABASE_SERVICE_ROLE_KEY` en local ;
- compatibilité complète avec `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ;
- migration 044 pour réaligner les anciennes lignes `access_credentials.auth_email` avec `auth.users.email`.

### À faire dans Supabase
Exécuter `supabase/migrations/044_v01092_repair_access_auth_email.sql` dans SQL Editor après avoir déjà exécuté la migration 043.

Le compte principal de l'établissement continue à se connecter avec son adresse e-mail réelle et son mot de passe habituel.

## Emploi du temps automatique — V1
Un bouton **Générer automatiquement** est ajouté au module Emplois du temps.

Le moteur V1 :
- lit les affectations classe / matière / enseignant ;
- lit le volume horaire hebdomadaire de chaque matière ;
- complète uniquement les heures manquantes ;
- conserve les créneaux déjà saisis ;
- empêche les doubles affectations d'une classe ;
- empêche les doubles affectations d'un enseignant ;
- répartit en priorité une matière sur plusieurs jours ;
- utilise la salle de la classe lorsqu'elle existe ;
- signale les heures impossibles à placer.

Les indisponibilités enseignants, préférences pédagogiques avancées et optimisation globale seront ajoutées dans les versions suivantes.
