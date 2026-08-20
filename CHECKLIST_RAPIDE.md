# ✅ CHECKLIST RAPIDE - Corriger "Invalid API key"
## Gabon Éduc+ Primaire v16 → Netlify Deploy Preview

---

## **5 MINUTES - Solution Directe**

### **Étape 1️⃣ : Obtenir la Clé**
```
Vous avez validé une clé Supabase qui marche.
Retrouvez-la dans votre presse-papiers ou:
- Supabase Dashboard → Settings → API
- Copier "Public Key" (ou "anon key" si c'est la seule disponible)
- Format: sb_publishable_xxxx... OU sb_anon_xxxx...
```

### **Étape 2️⃣ : Ouvrir Netlify**
```
https://app.netlify.com/sites/gaboneducplusprimaire/settings/deploys
```

### **Étape 3️⃣ : Ajouter la Variable**
```
Bouton: "Add environment variable"

Remplir:
  Nom:   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  Valeur: [Coller la clé testée]
  Scopes: ☑ Build  ☑ Render
  
  Cliquer: SAVE
```

### **Étape 4️⃣ : Redéployer**
```
Onglet "Deploys"
→ Dernier deploy
→ Menu "..."
→ "Trigger deploy"
→ "Clear cache and redeploy"
→ Attendre 3-5 minutes
```

### **Étape 5️⃣ : Tester**
```
Deploy Preview URL → /gabon-educ/connexion
→ Tenter connexion
→ "Invalid API key" doit avoir disparu ✓
```

---

## **Si Ça Ne Marche Pas**

| Symptôme | Solution |
|----------|----------|
| "Invalid API key" persiste | Vérifier que la bonne clé est dans Netlify (Settings → Environment) |
| Variable n'apparaît pas sauvegardée | Rafraîchir la page Netlify (F5) |
| Build échoue | Vérifier que la clé ne contient pas d'espaces ou de caractères invisibles |
| Clé commence pas par `sb_pub` ou `sb_anon` | Vérifier que vous copiez la clé Supabase (pas autre chose) |

---

## **Alternative : Script Automatisé**

```powershell
# Dans le dossier du projet:
.\configure-netlify-supabase.ps1

# Ou avec la clé directement:
.\configure-netlify-supabase.ps1 -SupabasePublishableKey "sb_publishable_..."
```

Le script automatise tout (validation, configuration, redéploiement).

---

## **Vérification Finale**

Après redéploiement, vérifier:

```
Deploy Preview:
  ✓ Page /gabon-educ/connexion s'affiche
  ✓ CSS et JavaScript chargés
  ✓ "Invalid API key" absent ✓
  ✓ Connexion fonctionne
  ✓ Dashboard s'ouvre
```

---

## **Sécurité**

```
✅ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY peut être publique
❌ N'exposez JAMAIS SUPABASE_SECRET_KEY côté client
✓ Les données restent protégées par RLS Supabase
```

---

## **Besoin d'Aide?**

Fichiers complèts disponibles:
- `DIAGNOSTIC_INVALID_API_KEY.md` - Analyse complète
- `.env.production.example` - Config d'exemple
- `configure-netlify-supabase.ps1` - Script automatisé

---

**Durée estimée:** 5-10 minutes  
**Risque:** ZÉRO (aucune modification du code ou des données)  
**Prochaines étapes:** Passer en production une fois validé sur Deploy Preview
