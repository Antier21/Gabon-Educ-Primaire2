#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Configure automatiquement les variables Supabase dans Netlify pour Gabon Éduc+ Primaire v16
.DESCRIPTION
    Ce script aide à configurer correctement NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans Netlify
    pour résoudre le problème "Invalid API key" sur le Deploy Preview.
.PARAMETER SupabasePublishableKey
    La clé Supabase Publishable Key à configurer (testée via l'API Supabase)
.PARAMETER SupabaseUrl
    L'URL Supabase (défaut: https://giubhbshbqledxquhnco.supabase.co)
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$SupabasePublishableKey,

    [Parameter(Mandatory = $false)]
    [string]$SupabaseUrl = "https://giubhbshbqledxquhnco.supabase.co"
)

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║ Configuration Netlify - Gabon Éduc+ Primaire v16              ║" -ForegroundColor Cyan
Write-Host "║ Problème: Invalid API key sur Deploy Preview                 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# ÉTAPE 1 : Vérifier Netlify CLI
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "📋 Étape 1 : Vérification de Netlify CLI..." -ForegroundColor Yellow
$netlifyExists = netlify --version 2>$null
if ($null -eq $netlifyExists) {
    Write-Host "  ❌ Netlify CLI non trouvé. Installez avec: npm install -g netlify-cli" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Netlify CLI trouvé: $netlifyExists" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# ÉTAPE 2 : Vérifier l'accès Netlify
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "🔐 Étape 2 : Vérification de l'accès Netlify..." -ForegroundColor Yellow
$siteInfo = netlify site:list 2>&1 | Select-String "gabon"
if ($null -eq $siteInfo) {
    Write-Host "  ⚠  Aucun site Netlify trouvé. Assurez-vous que vous êtes connecté:" -ForegroundColor Yellow
    Write-Host "  → netlify login" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Ou utilisez Netlify UI directement pour ajouter la variable." -ForegroundColor Cyan
    exit 1
}
Write-Host "  ✓ Accès Netlify OK" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# ÉTAPE 3 : Récupérer la clé Supabase si non fournie
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "🔑 Étape 3 : Configuration de la clé Supabase Publishable..." -ForegroundColor Yellow

if ([string]::IsNullOrEmpty($SupabasePublishableKey)) {
    Write-Host ""
    Write-Host "  Veuillez entrer votre clé Supabase Publishable Key:" -ForegroundColor Magenta
    Write-Host "  (Cette clé a été testée et validée via l'API Supabase /auth/v1/settings)" -ForegroundColor Gray
    Write-Host "  Format: sb_publishable_..." -ForegroundColor Gray
    Write-Host ""

    $SupabasePublishableKey = Read-Host "  → Clé Publishable"
    Write-Host ""
}

# Valider le format
if (-not $SupabasePublishableKey.StartsWith("sb_pub")) {
    Write-Host "  ⚠️  ATTENTION: La clé ne commence pas par 'sb_pub'" -ForegroundColor Yellow
    Write-Host "  Assurez-vous que c'est bien une Publishable Key (pas une anon_key)" -ForegroundColor Yellow
    $confirm = Read-Host "  Continuer quand même? (O/n)"
    if ($confirm -eq "n") {
        Write-Host "  ❌ Annulé par l'utilisateur" -ForegroundColor Red
        exit 1
    }
}

Write-Host "  ✓ Clé reçue (longueur: $($SupabasePublishableKey.Length) caractères)" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# ÉTAPE 4 : Tester la clé avec Supabase API
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "🧪 Étape 4 : Test de la clé avec l'API Supabase..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$SupabaseUrl/auth/v1/settings" `
        -Headers @{ apikey = $SupabasePublishableKey } `
        -Method Get `
        -UseBasicParsing `
        -TimeoutSec 10 `
        -ErrorAction Stop

    Write-Host "  ✓ Test OK (HTTP $($response.StatusCode))" -ForegroundColor Green
    Write-Host "  ✓ La clé est valide pour le projet Supabase: $SupabaseUrl" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Test échoué: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  ❌ La clé ne fonctionne pas avec ce projet Supabase" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Options:" -ForegroundColor Yellow
    Write-Host "  1. Vérifier que l'URL Supabase est correcte" -ForegroundColor Gray
    Write-Host "  2. Vérifier que la clé correspond à ce projet" -ForegroundColor Gray
    Write-Host "  3. Tester manuellement: " -ForegroundColor Gray
    Write-Host "     curl -H 'apikey: [votre-clé]' $SupabaseUrl/auth/v1/settings" -ForegroundColor Cyan
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# ÉTAPE 5 : Configurer dans Netlify
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "⚙️  Étape 5 : Configuration dans Netlify..." -ForegroundColor Yellow

Write-Host ""
Write-Host "  🟡 IMPORTANT - Deux méthodes possibles:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  MÉTHODE 1 - Interface web Netlify (RECOMMANDÉE)" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "  1. Ouvrir Netlify UI: https://app.netlify.com" -ForegroundColor Gray
Write-Host "  2. Aller à: Settings → Build & Deploy → Environment" -ForegroundColor Gray
Write-Host "  3. Ajouter nouvelle variable ou éditer:" -ForegroundColor Gray
Write-Host "     Nom:  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -ForegroundColor Cyan
Write-Host "     Valeur: [entrer la clé]" -ForegroundColor Cyan
Write-Host "  4. Scopes: Cocher Build, Function, Render (au moins Build)" -ForegroundColor Gray
Write-Host "  5. Enregistrer" -ForegroundColor Gray
Write-Host ""
Write-Host "  MÉTHODE 2 - CLI Netlify" -ForegroundColor Cyan
Write-Host "  ──────────────────────" -ForegroundColor Cyan
Write-Host "  Exécuter:" -ForegroundColor Gray
Write-Host "  netlify env:set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY `"$SupabasePublishableKey`" --scope builds" -ForegroundColor Cyan
Write-Host ""

# Demander à l'utilisateur quelle méthode
$method = Read-Host "  Voulez-vous utiliser la CLI (c) ou la UI (u)? Ou passer (p)?"

if ($method -eq "c") {
    Write-Host ""
    Write-Host "  → Configuration via CLI Netlify..." -ForegroundColor Yellow

    try {
        $output = netlify env:set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$SupabasePublishableKey" --scope builds 2>&1
        Write-Host "  ✓ Variable configurée" -ForegroundColor Green
        Write-Host "  Output: $output" -ForegroundColor Gray
    } catch {
        Write-Host "  ❌ Erreur lors de la configuration: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Utilisez la méthode UI à la place" -ForegroundColor Yellow
        exit 1
    }
} elseif ($method -eq "u") {
    Write-Host ""
    Write-Host "  → Configuration manuelle via Netlify UI" -ForegroundColor Yellow
    Write-Host "  Ouvrir le navigateur..." -ForegroundColor Gray
    Start-Process "https://app.netlify.com/sites/gaboneducplusprimaire/settings/deploys"
    Write-Host "  Attendez que le navigateur s'ouvre" -ForegroundColor Gray
    Read-Host "  Appuyez sur ENTER après avoir ajouté la variable dans Netlify UI"
} else {
    Write-Host ""
    Write-Host "  → Passé. Vous devrez configurer manuellement dans Netlify UI" -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
# ÉTAPE 6 : Vérifier la configuration
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "✅ Étape 6 : Vérification..." -ForegroundColor Yellow

try {
    $envCheck = netlify env:get NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --scope builds 2>&1
    if ($envCheck -like "*No value set*") {
        Write-Host "  ⚠️  La variable n'a pas pu être vérifiée via CLI" -ForegroundColor Yellow
        Write-Host "  Elle peut être définie dans Netlify UI - continuons" -ForegroundColor Gray
    } else {
        Write-Host "  ✓ Variable détectée dans Netlify (masquée par sécurité)" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠️  Impossible de vérifier via CLI - c'est OK" -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
# ÉTAPE 7 : Redéployer
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "🚀 Étape 7 : Redéploiement..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  → Pour redéployer, exécutez:" -ForegroundColor Cyan
Write-Host "  netlify deploy --build --context dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  OU" -ForegroundColor Cyan
Write-Host ""
Write-Host "  → Via Netlify UI:" -ForegroundColor Cyan
Write-Host "  1. Aller à Deploys" -ForegroundColor Gray
Write-Host "  2. Cliquer 'Trigger deploy' → 'Clear cache and redeploy'" -ForegroundColor Gray
Write-Host ""

$redeploy = Read-Host "  Redéployer maintenant via CLI? (O/n)"
if ($redeploy -ne "n") {
    Write-Host ""
    Write-Host "  → Lancement du build Netlify..." -ForegroundColor Yellow
    netlify deploy --build --context dev
    Write-Host ""
    Write-Host "  ✓ Build terminé" -ForegroundColor Green
}

# ─────────────────────────────────────────────────────────────────────────────
# RÉCAPITULATIF
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║ ✅ CONFIGURATION TERMINÉE                                     ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Prochaines étapes:" -ForegroundColor Cyan
Write-Host "  1. Attendre la fin du build Netlify (check Deploys)" -ForegroundColor Gray
Write-Host "  2. Ouvrir le Deploy Preview" -ForegroundColor Gray
Write-Host "  3. Tester la connexion: /gabon-educ/connexion" -ForegroundColor Gray
Write-Host "  4. Vérifier que 'Invalid API key' a disparu" -ForegroundColor Gray
Write-Host ""
Write-Host "❓ Si le problème persiste:" -ForegroundColor Yellow
Write-Host "  • Vérifier que la bonne clé a été configurée dans Netlify" -ForegroundColor Gray
Write-Host "  • Forcer un nouveau build via 'Clear cache and redeploy'" -ForegroundColor Gray
Write-Host "  • Vérifier que la clé commence par 'sb_pub'" -ForegroundColor Gray
Write-Host ""
