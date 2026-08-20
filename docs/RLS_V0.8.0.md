# RLS v0.8.0

Toutes les tables privées 012–022 activent Row Level Security. Les règles s’appuient sur :

- `belongs_to_school(school_id)` pour l’appartenance active ;
- `has_school_role(school_id, roles[])` pour les fonctions administratives ;
- `can_access_school_class(school_id, class_id)` pour les périmètres et affectations ;
- les liens responsables-élèves pour les vues parent ;
- `auth.uid()` pour l’auteur et le propriétaire.

Aucune politique privée v0.8.0 n’utilise `using (true)`. Les enseignants accèdent aux élèves et à l’assiduité des classes affectées. Les responsables et élèves ne lisent que leurs propres liens. Les actions sensibles de verrouillage/réouverture exigent un rôle autorisé et un motif.

Le test `lib/platform/migrations.test.ts` contrôle la séquence et interdit les politiques privées ouvertes. Il ne remplace pas un audit sur une instance Supabase réelle.
