# Migration v0.7 vers v0.8

Au premier accès à l’établissement, l’application inspecte les clés locales v0.7.0. Si des données existent, elle affiche exactement :

> Des données de la version précédente ont été détectées. Souhaitez-vous les intégrer à l’établissement ?

L’utilisateur voit les quantités, puis confirme ou laisse les données intactes. L’import associe les élèves à l’établissement et à l’année active, déduplique par matricule puis identité/classe, et écrit une entrée de journal. Les clés v0.7.0 ne sont jamais supprimées automatiquement.

Effectuer une sauvegarde du navigateur et de la base Supabase avant une migration de production.
