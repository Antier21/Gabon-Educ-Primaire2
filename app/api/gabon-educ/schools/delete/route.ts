import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Suppression définitive d'un établissement.
 *
 * Réservée au super-administrateur, et volontairement exigeante : la
 * suppression emporte en cascade les classes, les élèves, le personnel, les
 * bulletins et les comptes de connexion. Deux garde-fous encadrent donc
 * l'opération.
 *
 * Un appel sans `confirmName` ne supprime rien : il renvoie le décompte de ce
 * qui serait détruit, afin que l'interface le montre avant de demander
 * confirmation. La suppression n'a lieu que si le nom de l'établissement est
 * ensuite saisi à l'identique — une case à cocher se coche trop vite pour un
 * geste irréversible de cette ampleur.
 */

type DeletePayload = { schoolId?: string; confirmName?: string };

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message || record.details || record.hint || JSON.stringify(record));
  }
  return String(error || "Suppression impossible.");
}

async function countRows(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  table: string,
  column: string,
  schoolId: string,
) {
  const { count } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, schoolId);
  return count || 0;
}

export async function POST(request: Request) {
  try {
    const sessionClient = await createSessionClient();
    const { data: userData, error: userError } = await sessionClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Session administrateur absente." }, { status: 401 });
    }

    const { data: isSuperAdmin, error: roleError } = await sessionClient.rpc("is_super_admin");
    if (roleError) throw roleError;
    if (isSuperAdmin !== true) {
      return NextResponse.json(
        { error: "La suppression d’un établissement est réservée au super-administrateur." },
        { status: 403 },
      );
    }

    const raw = (await request.json()) as DeletePayload;
    const schoolId = String(raw.schoolId || "").trim();
    const confirmName = String(raw.confirmName || "").trim();
    if (!schoolId) {
      return NextResponse.json({ error: "Établissement requis." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const school = await admin
      .from("schools")
      .select("id,name")
      .eq("id", schoolId)
      .maybeSingle();
    if (school.error) throw school.error;
    if (!school.data) {
      return NextResponse.json({ error: "Établissement introuvable." }, { status: 404 });
    }
    const name = String(school.data.name || "");

    const inventory = {
      classes: await countRows(admin, "class_groups", "school_id", schoolId),
      eleves: await countRows(admin, "student_records", "school_id", schoolId),
      personnel: await countRows(admin, "school_staff", "school_id", schoolId),
      responsables: await countRows(admin, "guardians", "school_id", schoolId),
      comptes: await countRows(admin, "access_credentials", "school_id", schoolId),
      affectations: await countRows(admin, "school_teaching_assignments", "school_id", schoolId),
    };

    // Premier appel : on renseigne, on ne détruit rien.
    if (!confirmName) {
      return NextResponse.json({ name, inventory, deleted: false });
    }
    if (confirmName !== name) {
      return NextResponse.json(
        {
          error: `Le nom saisi ne correspond pas. Pour confirmer, écrivez exactement : ${name}`,
          name,
          inventory,
        },
        { status: 400 },
      );
    }

    // Les comptes de connexion doivent être retirés avant l'établissement :
    // la suppression en cascade effacerait leurs identifiants sans supprimer
    // les comptes d'authentification correspondants, qui resteraient orphelins.
    const credentials = await admin
      .from("access_credentials")
      .select("auth_user_id")
      .eq("school_id", schoolId);
    if (credentials.error) throw credentials.error;
    const authUserIds = (credentials.data || [])
      .map((row: { auth_user_id?: unknown }) => String(row.auth_user_id || ""))
      .filter(Boolean);

    let removedAccounts = 0;
    for (const authUserId of authUserIds) {
      // Une même personne peut travailler dans plusieurs établissements : son
      // compte n'est supprimé que s'il ne lui reste aucun autre rattachement.
      const { count } = await admin
        .from("school_memberships")
        .select("school_id", { count: "exact", head: true })
        .eq("user_id", authUserId)
        .neq("school_id", schoolId);
      if ((count || 0) === 0) {
        const removal = await admin.auth.admin.deleteUser(authUserId);
        if (!removal.error) removedAccounts += 1;
      }
    }

    const removal = await admin.from("schools").delete().eq("id", schoolId);
    if (removal.error) throw removal.error;

    return NextResponse.json({
      deleted: true,
      name,
      inventory,
      removedAccounts,
      message: `Établissement « ${name} » supprimé, ainsi que ${removedAccounts} compte(s) de connexion devenus sans objet.`,
    });
  } catch (error) {
    console.error("[Gabon Educ+] Suppression d’établissement échouée:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
