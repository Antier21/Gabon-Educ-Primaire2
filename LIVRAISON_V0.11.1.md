# Gabon Éduc+ v0.11.1

- Primaire : enseignant titulaire affecté automatiquement aux matières actives de sa classe.
- Exceptions par matière pour EPS, anglais, informatique, etc.
- Le générateur d'emploi du temps privilégie l'exception matière.
- Collège/lycée : modèle classe → matière → enseignant inchangé.
- Clé Supabase service_role : configuration une seule fois sur le même ordinateur, conservée côté serveur dans ~/.gabon-educ-plus/supabase-admin.json.
- Aucune clé sensible dans localStorage/sessionStorage.
- Aucune nouvelle migration Supabase.
