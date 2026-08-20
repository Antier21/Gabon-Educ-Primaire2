# Migration v0.8 vers v0.9

1. Exporter une sauvegarde v0.8.0 et sauvegarder Supabase.
2. Déployer le code 0.9.0 sans supprimer les clés locales existantes.
3. Appliquer 023–032, dans l’ordre. Si 023–031 sont déjà installées, appliquer uniquement 032.
4. Contrôler `attendance_records` hérité de 010/019 avant 029.
5. Ouvrir le diagnostic, vérifier établissement et migrations.
6. Tester une écriture hors ligne, synchronisation et restauration.

Retour arrière : conserver code v0.8.0 et sauvegarde ; ne pas supprimer les nouvelles tables tant que des opérations v0.9.0 sont en attente.
