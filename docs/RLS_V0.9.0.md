# RLS v0.9.0

Les tables 023–030 activent RLS et utilisent les helpers d’appartenance, de rôle et d’affectation. Aucun accès général `using (true)` n’est ajouté. Les journaux et versions publiées sont append-only.

Vérification requise en préproduction : établissement A/B, parent/enfant, élève/élève, enseignant hors affectation, compte suspendu, établissement désactivé, bulletin verrouillé. Tester avec la clé publique et des JWT réels, jamais avec `service_role`.
