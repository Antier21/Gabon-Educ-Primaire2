import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { isEmailLogin, normalizeAccessIdentifier } from "@/lib/access-identifiers";
import { createSupabaseAdminClient, getSupabasePublishableKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase/admin";

type ResolvePayload = { identifier?: string };

type AccessRow = {
  auth_email?: string | null;
  display_name?: string | null;
  role?: string | null;
  school_id?: string | null;
  status?: string | null;
};

function payloadFromRow(row: AccessRow) {
  return {
    authEmail: String(row.auth_email || ""),
    displayName: row.display_name || undefined,
    role: row.role || undefined,
    schoolId: row.school_id || undefined,
    loginKind: "access_identifier",
  };
}

export async function POST(request: Request) {
  try {
    const raw = (await request.json()) as ResolvePayload;
    const input = String(raw.identifier || "").trim();

    if (!input) {
      return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });
    }

    // Le compte responsable de l'établissement conserve sa connexion par e-mail réel.
    if (isEmailLogin(input)) {
      return NextResponse.json({ authEmail: input.toLowerCase(), loginKind: "school_email" });
    }

    const identifier = normalizeAccessIdentifier(input);
    if (!identifier) {
      return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    }

    // Avec la service-role, lecture directe et contrôle explicite du statut.
    if (getSupabaseServiceRoleKey()) {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin
        .from("access_credentials")
        .select("auth_email,display_name,role,school_id,status")
        .eq("identifier", identifier)
        .maybeSingle();
      if (error) throw error;
      if (!data || String(data.status || "") !== "active" || !data.auth_email) {
        return NextResponse.json({ error: "Identifiant ou mot de passe incorrect." }, { status: 404 });
      }
      return NextResponse.json(payloadFromRow(data));
    }

    // En installation locale, ne jamais inventer l'e-mail technique : on utilise
    // la fonction SQL prévue pour la résolution anonyme de l'identifiant.
    const url = getSupabaseUrl();
    const publicKey = getSupabasePublishableKey();
    if (!url || !publicKey) {
      return NextResponse.json({ error: "Configuration Supabase absente." }, { status: 503 });
    }
    const supabase = createSupabaseClient(url, publicKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.rpc("resolve_access_identifier", {
      p_identifier: identifier,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as AccessRow | null;
    if (!row?.auth_email) {
      return NextResponse.json({ error: "Identifiant ou mot de passe incorrect." }, { status: 404 });
    }
    return NextResponse.json(payloadFromRow(row));
  } catch (error) {
    console.error("[Gabon Educ+] Résolution identifiant échouée:", error);
    return NextResponse.json(
      { error: "Impossible de vérifier cet identifiant pour le moment." },
      { status: 500 },
    );
  }
}
