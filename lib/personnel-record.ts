export type SchoolStaffPayload = Record<string, string | number | null>;

type PersonnelFormValues = Record<string, FormDataEntryValue | null | undefined>;

function text(values: PersonnelFormValues, name: string) {
  return String(values[name] || "").trim();
}

function optionalText(values: PersonnelFormValues, name: string) {
  return text(values, name) || null;
}

export function formValues(form: FormData): PersonnelFormValues {
  return Object.fromEntries(form.entries());
}

export function buildSchoolStaffPayload(
  values: PersonnelFormValues,
  schoolId: string,
  today = new Date().toISOString().slice(0, 10),
): SchoolStaffPayload {
  const firstName = text(values, "first_name");
  const lastName = text(values, "last_name");

  if (!schoolId) throw new Error("Aucun établissement actif n’est sélectionné.");
  if (!firstName || !lastName) throw new Error("Le prénom et le nom sont obligatoires.");

  const yearsExperience = Number(text(values, "years_experience") || 0);
  if (!Number.isFinite(yearsExperience) || yearsExperience < 0) {
    throw new Error("L’ancienneté doit être un nombre positif ou nul.");
  }

  return {
    school_id: schoolId,
    employee_number: text(values, "employee_number") || `PERS-${Date.now()}`,
    first_name: firstName,
    last_name: lastName,
    gender: optionalText(values, "gender"),
    date_of_birth: optionalText(values, "date_of_birth"),
    place_of_birth: optionalText(values, "place_of_birth"),
    nationality: optionalText(values, "nationality"),
    marital_status: optionalText(values, "marital_status"),
    phone: optionalText(values, "phone"),
    email: optionalText(values, "email"),
    address: optionalText(values, "address"),
    emergency_contact_name: optionalText(values, "emergency_contact_name"),
    emergency_contact_phone: optionalText(values, "emergency_contact_phone"),
    national_id_number: optionalText(values, "national_id_number"),
    cnss_number: optionalText(values, "cnss_number"),
    staff_category: text(values, "staff_category") || "other",
    job_title: text(values, "job_title") || "Personnel",
    department: optionalText(values, "department"),
    employment_status: "active",
    hire_date: text(values, "hire_date") || today,
    contract_type: text(values, "contract_type") || "Autre",
    contract_start: optionalText(values, "contract_start"),
    contract_end: optionalText(values, "contract_end"),
    work_schedule: optionalText(values, "work_schedule"),
    highest_diploma: optionalText(values, "highest_diploma"),
    specialty: optionalText(values, "specialty"),
    years_experience: yearsExperience,
    previous_employer: optionalText(values, "previous_employer"),
    administrative_notes: optionalText(values, "administrative_notes"),
  };
}

export function personnelErrorMessage(error: unknown) {
  let raw = "Erreur inconnue";
  if (error instanceof Error) {
    raw = error.message;
  } else if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const parts = [
      value.message,
      value.details,
      value.hint,
      value.code ? `Code : ${value.code}` : "",
    ]
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    raw = parts.join(" — ") || JSON.stringify(value);
  } else if (error) {
    raw = String(error);
  }
  const message = raw.toLowerCase();
  if (message.includes("duplicate") || message.includes("unique")) {
    return "Ce matricule existe déjà dans cet établissement.";
  }
  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Votre compte n’est pas autorisé à enregistrer le personnel de cet établissement. Appliquez les migrations du registre Personnel puis reconnectez-vous.";
  }
  if (message.includes("schema cache") || message.includes("could not find") || message.includes("school_staff")) {
    return `La base Supabase du personnel doit être mise à jour avec la migration la plus récente. Détail : ${raw}`;
  }
  return raw;
}
