# Gabon Éduc+ v0.10.10.1

## Correctif ciblé : première création de classe

- La résolution de `grade_levels` est maintenant filtrée par `school_id`.
- Un compte lié à plusieurs établissements ne peut plus faire correspondre CP1/CE1/etc. au niveau d'un autre établissement.
- Le bouton de création/enregistrement reste indisponible tant que l'établissement actif, son type et ses niveaux ne sont pas complètement résolus.
- Pendant l'écriture, le bouton affiche `Enregistrement…`.
- Aucune migration Supabase supplémentaire n'est nécessaire.
