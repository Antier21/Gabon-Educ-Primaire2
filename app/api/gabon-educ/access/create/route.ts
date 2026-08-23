import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { buildAccessEmail, normalizeAccessIdentifier } from "@/lib/access-identifiers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const allowedCreatorRoles = ["super_admin", "school_admin", "headmaster", "secretary"];

type CreateAccessPayload = {
  schoolId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: string;
  classId?: string;
  identifier?: string;
  password?: string;
  /** Fiche de responsable à rattacher au compte créé (rôle parent). */
  guardianId?: string;
  /** Dossier d'élève à rattacher au compte créé (rôle élève). */
  studentId?: string;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message || record.error_description || record.details || record.hint || JSON.stringify(record));
  }
  return String(error || "Création de l’accès impossible.");
}

function normalizeRole(value: string) {
  if (value === "guardian") return "parent";
  if (value === "school_life") return "supervisor";
  return value || "teacher";
}

export async function POST(request: Request) {
  try {
    const sessionClient = await createSessionClient();
    const { data: userData, error: userError } = await sessionClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Session administrateur absente." }, { status: 401 });
    }

    const raw = (await request.json()) as CreateAccessPayload;
    const schoolId = clean(raw.schoolId);
    const firstName = clean(raw.firstName);
    const lastName = clean(raw.lastName);
    const phone = clean(raw.phone);
    const role = normalizeRole(clean(raw.role));
    const identifier = normalizeAccessIdentifier(clean(raw.identifier));
    const password = clean(raw.password);
    const classId = clean(raw.classId);
    const guardianId = clean(raw.guardianId);
    const studentId = clean(raw.studentId);

    if (!schoolId || !firstName || !lastName || !identifier || password.length < 8) {
      return NextResponse.json(
        { error: "Établissement, nom, identifiant et mot de passe de 8 caractères minimum sont requis." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();

    const { data: creatorProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userData.user.id)
      .maybeSingle();
    const creatorProfileId = creatorProfile?.id ? userData.user.id : null;

    const { data: authorization, error: authorizationError } = await admin
      .from("school_memberships")
      .select("role,status")
      .eq("school_id", schoolId)
      .eq("user_id", userData.user.id)
      .eq("status", "active");
    if (authorizationError) throw authorizationError;

    const canCreate =
      authorization?.some((item: { role?: string }) => allowedCreatorRoles.includes(String(item.role))) ||
      (await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "super_admin")
        .maybeSingle()).data?.role === "super_admin";

    if (!canCreate) {
      return NextResponse.json({ error: "Vous n’êtes pas autorisé à créer des accès." }, { status: 403 });
    }

    const { data: existingCredential, error: credentialReadError } = await admin
      .from("access_credentials")
      .select("auth_user_id,auth_email")
      .eq("identifier", identifier)
      .maybeSingle();
    if (credentialReadError) throw credentialReadError;

    const authEmail = String(existingCredential?.auth_email || buildAccessEmail(identifier));
    let authUserId = existingCredential?.auth_user_id ? String(existingCredential.auth_user_id) : "";

    if (authUserId) {
      const { error: updateUserError } = await admin.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName, role, access_identifier: identifier, school_id: schoolId },
      });
      if (updateUserError) throw updateUserError;
    } else {
      const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName, role, access_identifier: identifier, school_id: schoolId },
      });
      if (createUserError) throw createUserError;
      authUserId = createdUser.user.id;
    }

    const displayName = `${firstName} ${lastName}`.trim();

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        {
          id: authUserId,
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
          phone: phone || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    if (profileError) throw profileError;

    const { error: roleError } = await admin
      .from("user_roles")
      .upsert(
        { user_id: authUserId, role, scope_school_id: schoolId },
        { onConflict: "user_id,role,scope_school_id" },
      );
    if (roleError) throw roleError;

    const { error: membershipError } = await admin
      .from("school_memberships")
      .upsert(
        {
          school_id: schoolId,
          user_id: authUserId,
          role,
          status: "active",
          invitation_status: "accepted",
          scope_class_ids: classId ? [classId] : [],
          invited_by: creatorProfileId,
          joined_at: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "school_id,user_id,role" },
      );
    if (membershipError) throw membershipError;

    const { error: credentialError } = await admin
      .from("access_credentials")
      .upsert(
        {
          school_id: schoolId,
          auth_user_id: authUserId,
          identifier,
          auth_email: authEmail,
          display_name: displayName,
          role,
          status: "active",
          must_change_password: true,
          created_by: creatorProfileId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "identifier" },
      );
    if (credentialError) throw credentialError;

    // Rattachement du compte à la personne qu'il représente.
    //
    // Sans ce lien, un parent peut se connecter mais l'application ignore de
    // quels enfants il est responsable : son espace reste vide, et les
    // politiques RLS ne reconnaissent rien. C'est ici, au moment où le
    // secrétariat a la personne devant lui, que le rattachement est le plus
    // fiable.
    let linkWarning = "";
    if (role === "parent" && guardianId) {
      const { error: guardianLinkError } = await admin
        .from("guardians")
        .update({ profile_id: authUserId, updated_at: new Date().toISOString() })
        .eq("id", guardianId)
        .eq("school_id", schoolId);
      if (guardianLinkError) linkWarning = errorMessage(guardianLinkError);
    } else if (role === "student" && studentId) {
      const { error: studentLinkError } = await admin
        .from("student_records")
        .update({ profile_id: authUserId, updated_at: new Date().toISOString() })
        .eq("id", studentId)
        .eq("school_id", schoolId);
      if (studentLinkError) linkWarning = errorMessage(studentLinkError);
    } else if (role === "parent" || role === "student") {
      linkWarning =
        role === "parent"
          ? "Compte créé, mais aucune fiche de responsable ne lui est rattachée : son espace restera vide tant que le lien ne sera pas fait."
          : "Compte créé, mais aucun dossier d'élève ne lui est rattaché : son espace restera vide tant que le lien ne sera pas fait.";
    }

    return NextResponse.json({
      id: authUserId,
      identifier,
      authEmail,
      displayName,
      role,
      schoolId,
      ...(linkWarning ? { linkWarning } : {}),
    });
  } catch (error) {
    const message = errorMessage(error);
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
    console.error("[Gabon Educ+] Création accès utilisateur échouée:", error);
    return NextResponse.json(
      { error: message, code: code || undefined },
      { status: code === "ADMIN_KEY_REQUIRED" ? 503 : 500 },
    );
  }
}
