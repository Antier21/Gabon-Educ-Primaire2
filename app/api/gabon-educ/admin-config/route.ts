import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { getSupabaseUrl, persistSupabaseServiceRoleKey } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const sessionClient = await createSessionClient();
    const { data: session, error: sessionError } = await sessionClient.auth.getUser();
    if (sessionError || !session.user) return NextResponse.json({ error: "Session administrateur absente." }, { status: 401 });

    const body = await request.json().catch(() => ({})) as { serviceRoleKey?: string };
    const key = String(body.serviceRoleKey || "").trim();
    const url = getSupabaseUrl();
    if (!url || !key) return NextResponse.json({ error: "URL Supabase ou clé serveur manquante." }, { status: 400 });

    const probe = createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: probeError } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (probeError) return NextResponse.json({ error: "La clé serveur Supabase fournie est invalide ou insuffisante." }, { status: 400 });

    persistSupabaseServiceRoleKey(key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Configuration serveur impossible." }, { status: 500 });
  }
}
