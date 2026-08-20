# Tests de sécurité

## Automatisé localement

- absence de policy générale ouverte dans 023–030 ;
- RLS activée, journaux append-only, helpers centraux ;
- expurgation des secrets d’audit ;
- états suspendu, invitation expirée/révoquée, établissement désactivé et sans affectation.

## À exécuter sur Supabase

Créer deux établissements et des comptes admin, enseignant, parent, élève. Vérifier l’isolation A/B, parent/enfant, élève/élève, affectations enseignant, bulletin verrouillé, route sans session et clé `service_role` absente du bundle. Consigner requête, compte, résultat attendu/obtenu et preuve. Statut actuel : non exécuté faute d’instance distante fournie.
