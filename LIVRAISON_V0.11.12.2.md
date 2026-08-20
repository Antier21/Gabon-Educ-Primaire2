# Gabon Éduc+ v0.11.12.2

## Correctif build définitif pour CSS Modules

Cette version retire complètement les sélecteurs globaux `html`, `body`, `:global(html)` et `:global(body)` du fichier `SchoolDocumentTemplates.module.css`.

Pourquoi :
- Next.js refuse les sélecteurs purs dans un CSS Module.
- Le verrouillage A4 est maintenant porté uniquement par les classes locales du document, notamment `.preview` et `.bulletinPreview`.

Le correctif des bulletins A4 est conservé :
- format A4 portrait fixe ;
- résumé en 4 colonnes ;
- signatures en 3 colonnes ;
- tableau secondaire compact ;
- bas de page non imprimé pour éviter une deuxième page.

Aucune migration Supabase.
