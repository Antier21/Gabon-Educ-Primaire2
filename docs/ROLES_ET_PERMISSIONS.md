# Rôles et permissions

| Rôle | Principales capacités |
| --- | --- |
| Super administrateur | supervision technique multi-établissements |
| Administration | configuration, utilisateurs, scolarité, validation et publication |
| Chef d’établissement | contrôle, validation, verrouillage et réouverture motivée |
| Direction des études | structure pédagogique, matières et emplois du temps |
| Vie scolaire | assiduité et suivi des élèves |
| Secrétariat | dossiers, responsables, invitations et documents |
| Professeur principal | classe affectée, assiduité, appréciation générale et préparation des bulletins |
| Enseignant | classes et matières affectées, notes et appréciations par matière |
| Parent / responsable | enfants explicitement liés et données publiées |
| Élève | ses propres données publiées |

La matrice TypeScript est dans `lib/permissions/index.ts`. Elle améliore l’ergonomie en mode local. Seules les politiques RLS constituent la frontière de sécurité en mode connecté.
