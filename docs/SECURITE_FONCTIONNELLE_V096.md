# GABON Educ+ v0.9.6 — sécurité fonctionnelle

## Modules couverts

| Module | Contrôle avant écriture | Interface lecture seule | Barrière Supabase |
|---|---:|---:|---:|
| Annonces | Oui | Oui | Oui |
| Élèves | Oui | Oui | Oui |
| Parents / responsables | Oui | Oui | Oui |
| Utilisateurs / enseignants | Oui | Oui | Oui |
| Classes | Oui | Oui | Oui |
| Évaluations | Oui | Oui | Oui |
| Notes et bulletins | Oui | Oui | Oui |
| Documents | Oui | Oui | Oui |
| Emplois du temps | Oui | Oui | Oui |
| Matières et affectations | Oui | Oui | Oui |
| Assiduité | Oui | Oui | Oui |

## Défense en profondeur

1. L’interface charge proactivement le statut strict de l’établissement actif.
2. En cas de suspension, les contrôles d’écriture sont désactivés et le message centré est affiché.
3. Les magasins locaux Classes, Élèves, Évaluations, Notes et Bulletins vérifient `school_can_write_strict` avant toute mutation locale.
4. Le moteur Platform vérifie le statut avant de modifier l’espace local ou d’ajouter une opération à la file de synchronisation.
5. Les triggers et politiques Supabase bloquent l’écriture distante.
6. La lecture des données existantes reste disponible.

## Scénario de recette

Pour chaque module : actif → création autorisée ; suspendu → création/modification/suppression refusée ; lecture maintenue ; réactivation → écriture immédiatement rétablie.
