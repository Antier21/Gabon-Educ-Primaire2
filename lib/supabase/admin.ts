import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const SECRET_FILE = process.env.GABON_EDUC_SECRET_FILE || join(homedir(), ".gabon-educ-plus", "supabase-admin.json");

export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

export function getSupabasePublishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

function readPersistedServiceRoleKey() {
  try {
    const parsed = JSON.parse(readFileSync(SECRET_FILE, "utf8")) as { serviceRoleKey?: string };
    return String(parsed.serviceRoleKey || "").trim();
  } catch {
    return "";
  }
}

export function getSupabaseServiceRoleKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    readPersistedServiceRoleKey()
  );
}

export function persistSupabaseServiceRoleKey(value: string) {
  const key = String(value || "").trim();
  if (!key) throw new Error("Clé serveur Supabase vide.");
  mkdirSync(dirname(SECRET_FILE), { recursive: true });
  writeFileSync(SECRET_FILE, JSON.stringify({ serviceRoleKey: key }, null, 2), { encoding: "utf8", mode: 0o600 });
  try { chmodSync(SECRET_FILE, 0o600); } catch {}
}

export function createSupabaseAdminClient() {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!url || !serviceRoleKey) {
    const error = new Error("Configuration serveur Supabase absente : configuration administrateur requise une seule fois sur cet ordinateur.");
    (error as Error & { code?: string }).code = "ADMIN_KEY_REQUIRED";
    throw error;
  }
  return createSupabaseClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
