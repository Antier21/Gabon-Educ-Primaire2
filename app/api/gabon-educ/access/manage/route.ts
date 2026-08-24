import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { buildAccessEmail, normalizeAccessIdentifier } from "@/lib/access-identifiers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Gestion des comptes d'accès existants : correction, suspension, suppression.
 *
 * Jusqu'ici l'application ne savait que créer. Un identifiant saisi de travers
 * restait définitivement en base, et le bouton « Suspendre » écrivait dans une
 * table sans rapport avec la connexion — il ne suspendait donc rien.
 *
 * Principe retenu pour la suppression : refuser et expliquer plutôt que
 * détruire en cascade. Un compte encore rattaché à des affectations actives
 * n'est pas supprimé ; l'application dit précisément ce qui bloque.
 */

const allowedManagerRoles = ["super_admin", "school_admin", "headmaster", "secretary"];

type ManagePayload = {
  action?: "update" | "status" | "delete";
  schoolId?: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  identifier?: string;
  status?: "active" | "suspended";
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message || record.details || record.hint || JSON.stringify(record));
  }
  return String(error || "Opération impossible.");
}

export async function POST(request: Request) {
  try {
    const sessionClient = await createSessionClient();
    const { data: userData, error: userError } = await sessionClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Session administrateur absente." }, { status: 401 });
    }
    const actorId = userData.user.id;

    const raw = (await request.json()) as ManagePayload;
    const action = clean(raw.action) || "update";
    const schoolId = clean(raw.schoolId);
    const userId = clean(raw.userId);
    if (!schoolId || !userId) {
      return NextResponse.json({ error: "Établissement et utilisateur requis." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    // Seule l'administration de l'établissement peut gérer ses comptes.
    const { data: authorization } = await admin
      .from("school_memberships")
      .select("role")
      .eq("school_id", schoolId)
      .eq("user_id", actorId)
      .eq("status", "active");
    const isSuperAdmin =
      (
        await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", actorId)
          .eq("role", "super_admin")
          .maybeSingle()
      ).data?.role === "super_admin";
    const allowed =
      isSuperAdmin ||
      (authorization || []).some((item: { role?: string }) =>
        allowedManagerRoles.includes(String(item.role)),
      );
    if (!allowed) {
      return NextResponse.json(
        { error: "Vous n’avez pas les droits nécessaires sur cet établissement." },
        { status: 403 },
      );
    }

    // Un administrateur qui supprimerait ou suspendrait son propre compte se
    // fermerait la porte : le cas est refusé explicitement.
    if (userId === actorId && action !== "update") {
      return NextResponse.json(
        { error: "Vous ne pouvez pas suspendre ni supprimer votre propre compte." },
        { status: 400 },
      );
    }

    if (action === "status") {
      const status = raw.status === "suspended" ? "suspended" : "active";
      // La connexion contrôle access_credentials.status : c'est donc là que la
      // suspension doit être écrite pour avoir un effet réel.
      const credential = await admin
        .from("access_credentials")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("school_id", schoolId)
        .eq("auth_user_id", userId);
      if (credential.error) throw credential.error;
      const membership = await admin
        .from("school_memberships")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("school_id", schoolId)
        .eq("user_id", userId);
      if (membership.error) throw membership.error;
      return NextResponse.json({
        ok: true,
        status,
        message:
          status === "suspended"
            ? "Compte suspendu. Cet identifiant ne permet plus de se connecter."
            : "Compte réactivé.",
      });
    }

    if (action === "update") {
      const firstName = clean(raw.firstName);
      const lastName = clean(raw.lastName);
      const phone = clean(raw.phone);
      const identifier = raw.identifier ? normalizeAccessIdentifier(clean(raw.identifier)) : "";
      const displayName = `${firstName} ${lastName}`.trim();

      if (firstName || lastName) {
        const profile = await admin
          .from("profiles")
          .update({
            ...(firstName ? { first_name: firstName } : {}),
            ...(lastName ? { last_name: lastName } : {}),
            ...(phone ? { phone } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        if (profile.error) throw profile.error;
      }

      const credentialUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (displayName) credentialUpdate.display_name = displayName;
      if (identifier) {
        // L'identifiant sert aussi à fabriquer l'e-mail technique Supabase :
        // les deux doivent rester cohérents, sans quoi la connexion casse.
        const taken = await admin
          .from("access_credentials")
          .select("auth_user_id")
          .eq("identifier", identifier)
          .maybeSingle();
        if (taken.data?.auth_user_id && String(taken.data.auth_user_id) !== userId) {
          return NextResponse.json(
            { error: `L’identifiant « ${identifier} » est déjà utilisé par un autre compte.` },
            { status: 409 },
          );
        }
        const authEmail = buildAccessEmail(identifier);
        const authUpdate = await admin.auth.admin.updateUserById(userId, { email: authEmail });
        if (authUpdate.error) throw authUpdate.error;
        credentialUpdate.identifier = identifier;
        credentialUpdate.auth_email = authEmail;
      }

      const credential = await admin
        .from("access_credentials")
        .update(credentialUpdate)
        .eq("school_id", schoolId)
        .eq("auth_user_id", userId);
      if (credential.error) throw credential.error;

      return NextResponse.json({ ok: true, message: "Compte mis à jour." });
    }

    if (action === "delete") {
      // Refuser et expliquer : on énumère ce qui dépend encore de ce compte
      // avant de détruire quoi que ce soit.
      const blockers: string[] = [];

      const assignments = await admin
        .from("school_teaching_assignments")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("teacher_id", userId)
        .eq("is_active", true);
      if ((assignments.count || 0) > 0)
        blockers.push(
          `${assignments.count} affectation(s) pédagogique(s) active(s) — retirez-les d’abord dans Matières`,
        );

      const ownedClasses = await admin
        .from("class_groups")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("owner_teacher_id", userId);
      if ((ownedClasses.count || 0) > 0)
        blockers.push(`${ownedClasses.count} classe(s) créée(s) par ce compte`);

      if (blockers.length) {
        return NextResponse.json(
          {
            error: `Suppression impossible : ${blockers.join(" ; ")}.`,
            blockers,
          },
          { status: 409 },
        );
      }

      // Le compte peut représenter un parent ou un élève : on détache le lien
      // sans jamais supprimer la fiche de la personne, qui appartient à
      // l'établissement et non au compte.
      await admin.from("guardians").update({ profile_id: null }).eq("profile_id", userId);
      await admin.from("student_records").update({ profile_id: null }).eq("profile_id", userId);
      await admin
        .from("school_staff")
        .update({ pedagogical_user_id: null })
        .eq("school_id", schoolId)
        .eq("pedagogical_user_id", userId);

      const credential = await admin
        .from("access_credentials")
        .delete()
        .eq("school_id", schoolId)
        .eq("auth_user_id", userId);
      if (credential.error) throw credential.error;

      await admin
        .from("school_memberships")
        .delete()
        .eq("school_id", schoolId)
        .eq("user_id", userId);
      await admin.from("user_roles").delete().eq("user_id", userId).eq("scope_school_id", schoolId);

      // Le compte d'authentification n'est supprimé que s'il n'appartient plus
      // à aucun établissement : la même personne peut travailler dans deux
      // écoles gérées par la même plateforme.
      const remaining = await admin
        .from("school_memberships")
        .select("school_id", { count: "exact", head: true })
        .eq("user_id", userId);
      let authRemoved = false;
      if ((remaining.count || 0) === 0) {
        const removal = await admin.auth.admin.deleteUser(userId);
        if (removal.error) throw removal.error;
        authRemoved = true;
      }

      return NextResponse.json({
        ok: true,
        authRemoved,
        message: authRemoved
          ? "Compte supprimé. Cet identifiant ne permet plus de se connecter."
          : "Accès retiré de cet établissement. Le compte reste actif dans un autre établissement.",
      });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("[Gabon Educ+] Gestion d’un accès échouée:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
