# Gabon Éduc+ Primaire — v0.12.0-primary.14

Correctif ciblé du test de sécurité super-administrateur local.

- connexion par e-mail : relit désormais le rôle réel après authentification ;
- `super_admin` redirigé vers `/gabon-educ/service-abonnements` ;
- suppression du contexte établissement local résiduel lors de la connexion super-admin ;
- page abonnements : contrôle explicite de la session et de `is_super_admin()` ;
- nouvelle RPC `get_service_subscriptions()` réservée au super-admin ;
- migration additive `062_super_admin_service_subscriptions_rpc.sql` ; aucune réinitialisation de base.
