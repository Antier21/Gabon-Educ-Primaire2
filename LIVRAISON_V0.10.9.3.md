# Gabon Éduc+ v0.10.9.3 — profils d’établissement stricts

Cette version corrige le mélange de niveaux entre cycles.

- École primaire : CP1, CP2, CE1, CE2, CM1, CM2 uniquement.
- Collège : 6e, 5e, 4e, 3e uniquement.
- Lycée : 2nde, 1re, Terminale uniquement.
- Complexe scolaire : profil distinct, seul type autorisé à regrouper les trois cycles.
- Les niveaux hérités d’un autre type d’établissement sont filtrés au chargement.
- Le changement de type d’établissement reconstruit la structure des niveaux au lieu de conserver un mélange ancien.
- Le formulaire de création de classe refuse un niveau incompatible avec le type d’établissement.
- Le profil choisi pendant l’ouverture de compte est verrouillé pendant l’enregistrement pour éviter les incohérences.
- La racine / redirige vers /gabon-educ.

Migration Supabase à exécuter : `045_v01093_strict_school_levels.sql`.
