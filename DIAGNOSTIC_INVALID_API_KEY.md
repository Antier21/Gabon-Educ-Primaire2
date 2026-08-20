# 🔍 DIAGNOSTIC - Invalid API key sur Deploy Preview Netlify
## Gabon Éduc+ Primaire v16

---

## **RÉSUMÉ EXÉCUTIF**

**Problème :** Le message "Invalid API key" apparaît au login sur le Deploy Preview Netlify, alors que le code fonctionne en local.

**Cause racine :** La variable d'environnement `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` n'a **jamais été définie** dans Netlify. Le code fallback sur `NEXT_PUBLIC_SUPABASE_ANON_KEY`, qui contient probablement une **clé obsolète ou incorrecte**.

**Solution :** Ajouter ou remplacer la clé Supabase dans les variables d'environnement Netlify avec la bonne clé Publishable Key.

---

## **ANALYSE DÉTAILLÉE**

### 1️⃣ Le Code Source (Confirmé ✓)

Tous les fichiers Supabase recherchent les variables dans cet ordre :
```typescript
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```

**Fichiers affectés :**
- `lib/supabase/client.ts` (ligne 10)
- `lib/supabase/server.ts` (ligne 9)
- `middleware.ts` (ligne 70)
- `lib/supabase/proxy.ts` (ligne 8)
- `lib/supabase/admin.ts` (ligne 13)
- `components/AuthForm.tsx` (ligne 75)

### 2️⃣ Configuration Locale vs Production

| Aspect | Local (`.env.example`) | Netlify (`.env`) |
|--------|-------|---------|
| **Variable préférée** | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ✓ | **ABSENTE** ❌ |
| **Variable fallback** | (si nécessaire) | `NEXT_PUBLIC_SUPABASE_ANON_KEY=***-8eu` |
| **Status** | Fonctionne | 🔴 Mauvaise clé |

### 3️⃣ Le Flux Exact du Problème

```
1. Netlify lance npm run build
   ↓
2. Next.js cherche NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans les vars env
   ↓
3. **Variable n'existe pas dans Netlify** ❌
   ↓
4. Fallback sur NEXT_PUBLIC_SUPABASE_ANON_KEY=***-8eu
   ↓
5. La clé ***-8eu est compilée dans le bundle JavaScript
   ↓
6. Au navigateur, supabase.auth.signInWithPassword() utilise cette clé
   ↓
7. Supabase rejette la clé : "Invalid API key"
   ↓
8. Utilisateur voit l'erreur sur la page de connexion ❌
```

### 4️⃣ Preuves de l'Analyse

**Fichier `.env` (Netlify - Production) :**
```bash
NEXT_PUBLIC_SUPABASE_ANON_KEY=***-8eu
NEXT_PUBLIC_SUPABASE_URL=https://giubhbshbqledxquhnco.supabase.co
SUPABASE_SERVICE_ROLE_KEY=***hii6
```

**Fichier `.env.example` (Local - Développement) :**
```bash
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=COLLEZ_ICI_LA_CLE_PUBLIQUE_LOCALE
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
SUPABASE_SECRET_KEY=COLLEZ_ICI_LA_CLE_SECRETE_DU_PROJET_SUPABASE
```

**Différence clé :**
- Local utilise : `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (nouveau modèle ✓)
- Netlify utilise : `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ancien modèle, mauvaise valeur ❌)

### 5️⃣ Pourquoi le Code Préfère `PUBLISHABLE_KEY`

Supabase v2+ a changé son modèle de clés :
- **Anciennement :** `anon_key` (uniquement pour auth)
- **Maintenant :** `publishable_key` (plus générique, meilleure sécurité)

Le code a été mis à jour pour utiliser le nouveau modèle, d'où la préférence pour `PUBLISHABLE_KEY`.

### 6️⃣ Tentative CLI Échouée

L'utilisateur a tenté :
```powershell
netlify env:set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY $k --context dev --scope builds --force
```

**Résultat :** La variable n'a jamais été enregistrée.

**Cause probable :**
- Le scope/context combinaison n'existe peut-être pas dans Netlify
- Ou la syntaxe CLI Netlify a un problème
- Solution : **Utiliser l'interface web Netlify au lieu de la CLI**

---

## **SOLUTION**

### ✅ Étape 1 : Obtenir la Bonne Clé Supabase

Vous avez validé une clé Publishable en PowerShell :
```powershell
$k = Read-Host "Colle la Publishable key Supabase"
$k.StartsWith("sb_publishable_")  # Retourna: True

$u = "https://giubhbshbqledxquhnco.supabase.co"
$r = Invoke-WebRequest -Uri "$u/auth/v1/settings" -Headers @{ apikey = $k } -Method Get
# Résultat: HTTP 200 ✓
```

**Cette clé est la bonne.** Gardez-la à portée de main (presse-papiers, etc.)

### ✅ Étape 2 : Configurer dans Netlify UI (RECOMMANDÉ)

1. **Ouvrir Netlify :**
   - Aller à : https://app.netlify.com/sites/gaboneducplusprimaire/settings/deploys

2. **Ajouter une Variable d'Environnement :**
   - Cliquer sur "Add environment variable"
   - **Nom :** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Valeur :** [Coller la clé validée]
   - **Scopes :** Cocher au minimum "Build" (et de préférence Build + Render)
   - **Cliquer "Save"**

3. **Vérifier :**
   - La variable doit s'afficher dans la liste (masquée avec `****`)

### ✅ Étape 3 : Redéployer

**Via Netlify UI (Plus simple) :**
1. Aller à l'onglet "Deploys"
2. Cliquer sur le menu "..." du dernier deploy
3. Sélectionner "Trigger deploy" → "Clear cache and redeploy"
4. Attendre la fin du build

**Via CLI :**
```bash
netlify deploy --build --context dev
```

### ✅ Étape 4 : Tester

1. Ouvrir le Deploy Preview (URL fournie par Netlify)
2. Aller à `/gabon-educ/connexion`
3. Tenter une connexion
4. **Le message "Invalid API key" ne doit plus apparaître** ✓

---

## **ALTERNATIVE : Utiliser un Script Automatisé**

Un script PowerShell a été préparé pour automatiser tout cela :

```powershell
# À exécuter dans le dossier du projet
.\configure-netlify-supabase.ps1
```

Le script :
- ✓ Demande la clé Supabase
- ✓ Valide la clé avec l'API Supabase
- ✓ Configure Netlify via CLI ou UI
- ✓ Redéploie automatiquement
- ✓ Teste le résultat

---

## **FAQ - Dépannage**

### Q: La clé ne commence pas par `sb_pub`?
**R:** Vous utilisez peut-être une `anon_key` au lieu d'une `publishable_key`. Vérifiez dans le tableau de bord Supabase.

### Q: Le message persiste après redéploiement?
**R:**
1. Forcer "Clear cache and redeploy" depuis Netlify UI
2. Vérifier que la bonne clé est bien dans Netlify (Settings → Environment)
3. Attendre 2-3 minutes (Netlify met du temps à mettre à jour les caches)

### Q: Où trouver la Publishable Key dans Supabase?
**R:** Supabase Dashboard → Settings → API → Project "API Keys" → Copier "anon key" OU "Public Key"

### Q: La CLI Netlify ne sauvegarde pas?
**R:** Utilisez Netlify UI à la place. C'est plus fiable.

### Q: Y a-t-il d'autres variables à configurer?
**R:** Non. Seule `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou `ANON_KEY` en fallback) est nécessaire. L'URL est déjà correcte.

---

## **SÉCURITÉ**

✅ **Les variables `NEXT_PUBLIC_*` arrivent au bundle client (c'est normal et sécurisé)**

❌ **`SUPABASE_SECRET_KEY` et `SUPABASE_SERVICE_ROLE_KEY` ne doivent JAMAIS être `NEXT_PUBLIC_*`**

✓ Vérification effectuée : Les clés secrètes ne sont pas exposées côté client.

---

## **IMPACT SUR LES FONCTIONNALITÉS**

Cette correction n'affecte RIEN d'autre :
- ✓ Isolation établissements maintenue
- ✓ Données Supabase intactes
- ✓ Migrations (063, etc.) toujours actives
- ✓ RLS toujours en place
- ✓ Zéro modification du code
- ✓ Zéro suppression de données

C'est une **configuration uniquement**, pas une modification d'architecture.

---

## **COMMANDES RAPIDES**

```bash
# Vérifier le build localement
npm run build

# Vérifier les variables (lisible)
grep NEXT_PUBLIC_SUPABASE .env

# Redéployer depuis la CLI
netlify deploy --build --context dev

# Ouvrir Netlify UI (variables)
start https://app.netlify.com/sites/gaboneducplusprimaire/settings/deploys
```

---

## **PROCHAINES ÉTAPES**

1. **Immédiat :** Ajouter `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` dans Netlify UI
2. **Redéployer** via "Clear cache and redeploy"
3. **Tester** la connexion sur le Deploy Preview
4. **Vérifier** que les élèves, parents, enseignants, et administrateurs peuvent se connecter

---

**Créé par :** Analyse automatisée Gabon Éduc+ Primaire v16  
**Date :** 2026-08-20  
**Problème :** Invalid API key sur Netlify Deploy Preview  
**Statut :** Diagnostic complet + Solution préparée
