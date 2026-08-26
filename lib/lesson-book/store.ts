"use client";

/**
 * Lecture et écriture du cahier de textes.
 *
 * Écritures directes vers Supabase, sans passer par la file de
 * synchronisation. Le cahier de textes fait foi : une séance doit être
 * enregistrée ou ne pas l'être, jamais rester en attente à l'insu de
 * l'enseignant qui croirait sa progression consignée.
 */

import { createClient } from "@/lib/supabase/client";
import { confirmWrite } from "@/lib/supabase/confirm-write";
import { plainToRichText, richTextToLines, sanitizeRichText } from "./rich-text";
import { shortTime, toISODate, weekDays } from "./week";

/** Un créneau de l'emploi du temps de l'enseignant. */
export type TeacherSlot = {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectLabel: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string;
};

export type LessonBookEntry = {
  id: string;
  classId: string;
  subjectId: string;
  sessionDate: string;
  startsAt: string;
  endsAt: string;
  title: string;
  contentHtml: string;
  programElements: string;
  category: string;
  themes: string[];
  isPublished: boolean;
  publishedAt: string;
  updatedAt: string;
};

/**
 * Les catégories proposées.
 *
 * Reprises du cahier de textes réel : ce sont les mots qu'un enseignant écrit
 * déjà. La liste est une proposition, pas une contrainte — le champ reste
 * libre, parce qu'aucune liste ne couvrira toutes les disciplines.
 */
export const LESSON_CATEGORIES = [
  "Cours et activités orales",
  "Applications",
  "Exercices",
  "Évaluation",
  "Correction",
  "Révision",
  "Travaux dirigés",
  "Travaux pratiques",
] as const;

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [raw.message, raw.details]
      .map((value) => (typeof value === "string" ? value : ""))
      .filter(Boolean);
    const code = typeof raw.code === "string" && raw.code ? ` (code ${raw.code})` : "";
    if (parts.length) return `${parts.join(" — ")}${code}`;
  }
  return "Cahier de textes indisponible.";
}

/**
 * L'emploi du temps de l'enseignant connecté.
 *
 * Il sert de squelette à la grille de la semaine. Un établissement qui n'a pas
 * encore saisi ses emplois du temps rendra une liste vide : l'écran propose
 * alors la saisie libre, plutôt que de rester inutilisable jusqu'à ce que
 * l'administration ait fini son travail.
 */
export async function loadTeacherSlots(teacherId: string): Promise<TeacherSlot[]> {
  if (!teacherId) return [];
  const { data, error } = await createClient()
    .from("timetable_slots")
    .select(
      "id,class_group_id,school_subject_id,weekday,starts_at,ends_at,room," +
        "class_groups(name),school_subjects(label)",
    )
    .eq("teacher_id", teacherId)
    .order("weekday")
    .order("starts_at");
  if (error) throw new Error(describe(error));

  type Row = {
    id: string;
    class_group_id: string;
    school_subject_id: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
    room?: string | null;
    class_groups?: { name?: string } | null;
    school_subjects?: { label?: string } | null;
  };

  return ((data || []) as unknown as Row[]).map((row) => ({
    id: String(row.id),
    classId: String(row.class_group_id || ""),
    className: String(row.class_groups?.name || "Classe"),
    subjectId: String(row.school_subject_id || ""),
    subjectLabel: String(row.school_subjects?.label || "Matière"),
    weekday: Number(row.weekday || 1),
    startsAt: shortTime(row.starts_at),
    endsAt: shortTime(row.ends_at),
    room: String(row.room || ""),
  }));
}

/** Une classe et une matière confiées à l'enseignant, sans horaire. */
export type TeacherAssignment = {
  classId: string;
  className: string;
  subjectId: string;
  subjectLabel: string;
};

/**
 * Ce que l'enseignant enseigne, indépendamment de tout emploi du temps.
 *
 * C'est la source qui permet de tenir le cahier de textes dans un
 * établissement qui n'a pas encore saisi ses horaires — c'est-à-dire, presque
 * toujours, en début d'année, au moment précis où l'on en a besoin. Les
 * affectations, elles, sont posées dès la rentrée : sans elles, l'enseignant
 * n'aurait pas de classe du tout.
 */
export async function loadTeacherAssignments(teacherId: string): Promise<TeacherAssignment[]> {
  if (!teacherId) return [];
  const { data, error } = await createClient()
    .from("school_teaching_assignments")
    .select("class_group_id,school_subject_id,class_groups(name),school_subjects(label)")
    .eq("teacher_id", teacherId)
    .eq("is_active", true);
  if (error) throw new Error(describe(error));

  type Row = {
    class_group_id: string;
    school_subject_id: string;
    class_groups?: { name?: string } | null;
    school_subjects?: { label?: string } | null;
  };

  const vues = new Set<string>();
  const sortie: TeacherAssignment[] = [];
  for (const row of (data || []) as unknown as Row[]) {
    const cle = `${row.class_group_id}|${row.school_subject_id}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    sortie.push({
      classId: String(row.class_group_id || ""),
      className: String(row.class_groups?.name || "Classe"),
      subjectId: String(row.school_subject_id || ""),
      subjectLabel: String(row.school_subjects?.label || "Matière"),
    });
  }
  return sortie.sort((a, b) =>
    `${a.className}${a.subjectLabel}`.localeCompare(`${b.className}${b.subjectLabel}`, "fr"),
  );
}

function toEntry(row: Record<string, unknown>): LessonBookEntry {
  return {
    id: String(row.id || ""),
    classId: String(row.class_group_id || ""),
    subjectId: String(row.school_subject_id || ""),
    sessionDate: String(row.session_date || ""),
    startsAt: shortTime(row.starts_at as string),
    endsAt: shortTime(row.ends_at as string),
    title: String(row.title || ""),
    // Filtré à la lecture autant qu'à l'écriture : ce qui est entré par un
    // autre chemin — import, base, version antérieure — doit l'être aussi.
    contentHtml: sanitizeRichText(String(row.content_html || "")),
    programElements: String(row.program_elements || ""),
    category: String(row.category || ""),
    themes: Array.isArray(row.themes) ? (row.themes as string[]).map(String) : [],
    isPublished: row.is_published === true,
    publishedAt: String(row.published_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

/** Les séances déjà consignées pendant une semaine donnée. */
export async function loadWeekEntries(
  teacherId: string,
  monday: Date,
): Promise<LessonBookEntry[]> {
  if (!teacherId) return [];
  const jours = weekDays(monday);
  const { data, error } = await createClient()
    .from("lesson_book_entries")
    .select("*")
    .eq("teacher_id", teacherId)
    .gte("session_date", toISODate(jours[0]))
    .lte("session_date", toISODate(jours[jours.length - 1]))
    .order("session_date")
    .order("starts_at");
  if (error) throw new Error(describe(error));
  return ((data || []) as Array<Record<string, unknown>>).map(toEntry);
}

export type EntryDraft = {
  id?: string;
  schoolId: string;
  academicYearId?: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  timetableSlotId?: string;
  sessionDate: string;
  startsAt: string;
  endsAt: string;
  title: string;
  contentHtml: string;
  programElements: string;
  category: string;
  themes: string[];
};

/**
 * Enregistre une séance.
 *
 * Le contenu est filtré ici, avant d'atteindre la base : un contenu dangereux
 * ne doit pas y séjourner, même une seconde, même s'il est refiltré à
 * l'affichage. Défendre en deux endroits est le seul moyen de ne pas dépendre
 * d'un seul.
 */
export async function saveEntry(draft: EntryDraft): Promise<string> {
  const client = createClient();
  const payload = {
    school_id: draft.schoolId,
    academic_year_id: draft.academicYearId || null,
    class_group_id: draft.classId,
    school_subject_id: draft.subjectId || null,
    teacher_id: draft.teacherId,
    timetable_slot_id: draft.timetableSlotId || null,
    session_date: draft.sessionDate,
    starts_at: draft.startsAt || null,
    ends_at: draft.endsAt || null,
    title: draft.title.trim(),
    content_html: sanitizeRichText(draft.contentHtml),
    program_elements: draft.programElements.trim(),
    category: draft.category.trim(),
    themes: draft.themes.map((theme) => theme.trim()).filter(Boolean),
  };

  if (draft.id) {
    const result = await client
      .from("lesson_book_entries")
      .update(payload)
      .eq("id", draft.id)
      .select("id");
    confirmWrite(result, "l’enregistrement de cette séance");
    return draft.id;
  }

  const { data, error } = await client
    .from("lesson_book_entries")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(describe(error));
  return String((data as { id?: string })?.id || "");
}

/**
 * Remet la séance aux familles, ou la retire.
 *
 * Même règle que le bulletin : écrire et remettre sont deux gestes. Une séance
 * en cours de rédaction ne doit pas atteindre les parents à moitié écrite.
 */
export async function setEntryPublished(id: string, published: boolean): Promise<void> {
  const result = await createClient()
    .from("lesson_book_entries")
    .update({
      is_published: published,
      published_at: published ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("id");
  confirmWrite(
    result,
    published ? "la publication de cette séance" : "le retrait de cette séance",
  );
}

export async function deleteEntry(id: string): Promise<void> {
  const result = await createClient()
    .from("lesson_book_entries")
    .delete()
    .eq("id", id)
    .select("id");
  confirmWrite(result, "la suppression de cette séance");
}

/* ===================================================================
 * Le travail à effectuer.
 *
 * Une séance peut n'en donner aucun, ou trois : une lecture pour demain, un
 * exercice pour la semaine prochaine, un exposé pour le mois. Chacun porte donc
 * sa propre échéance — et c'est elle qui compte pour l'élève, pas la date de la
 * séance où le travail a été donné. Un cahier de textes qui ne dirait que « du
 * travail a été donné le 12 » obligerait chaque famille à recalculer ce qui est
 * dû demain.
 * =================================================================== */

/**
 * Comment le travail se rend.
 *
 * La liste est celle de la base, et elle y est contrainte : une valeur inventée
 * serait refusée par le serveur. « aucun » n'est pas un vide poli — c'est le
 * cas réel de la leçon à apprendre, qui se contrôle sans rien ramasser.
 */
export const HOMEWORK_MODES = [
  { value: "papier", label: "Sur papier" },
  { value: "oral", label: "À l’oral" },
  { value: "en ligne", label: "En ligne" },
  { value: "aucun", label: "Rien à rendre" },
] as const;

export type HomeworkMode = (typeof HOMEWORK_MODES)[number]["value"];

function toMode(valeur: unknown): HomeworkMode {
  const brut = String(valeur || "papier");
  return (HOMEWORK_MODES.find((mode) => mode.value === brut)?.value || "papier") as HomeworkMode;
}

export type Homework = {
  id: string;
  /** Le texte tel qu'il se saisit et se relit : des lignes, pas du HTML. */
  description: string;
  dueDate: string;
  mode: HomeworkMode;
  durationMinutes: number | null;
};

/** Les colonnes d'un travail, dans l'ordre où on les relit partout. */
export const HOMEWORK_COLUMNS =
  "id,entry_id,description_html,due_date,submission_mode,duration_minutes,position";

/**
 * Une ligne de la base rendue à sa forme d'écran.
 *
 * Exportée parce que la progression annuelle relit les devoirs de cent
 * cinquante séances en une seule requête : elle a besoin de la même conversion
 * sans pouvoir passer par « loadHomework », qui n'en lit qu'une.
 */
export function homeworkFromRow(row: Record<string, unknown>): Homework {
  return {
    id: String(row.id),
    description: richTextToLines(String(row.description_html || "")),
    dueDate: String(row.due_date || ""),
    mode: toMode(row.submission_mode),
    durationMinutes:
      row.duration_minutes === null || row.duration_minutes === undefined
        ? null
        : Number(row.duration_minutes),
  };
}

export async function loadHomework(entryId: string): Promise<Homework[]> {
  if (!entryId) return [];
  const { data, error } = await createClient()
    .from("lesson_book_homework")
    .select(HOMEWORK_COLUMNS)
    .eq("entry_id", entryId)
    .order("position");
  if (error) throw new Error(describe(error));
  return ((data || []) as unknown as Array<Record<string, unknown>>).map(homeworkFromRow);
}

/**
 * Met la liste des travaux en accord avec ce qui est à l'écran.
 *
 * Trois opérations plutôt qu'un « tout effacer puis tout réécrire » : ce
 * dernier est plus court à écrire, mais si la réécriture échoue après
 * l'effacement, le travail donné aux élèves a disparu sans que personne ne
 * l'ait demandé. On ne supprime donc que ce que l'enseignant a retiré.
 *
 * Un travail dont la description a été vidée est un travail retiré : c'est le
 * geste naturel, et l'exiger autrement serait un piège.
 */
export async function saveHomework(
  entryId: string,
  schoolId: string,
  items: Homework[],
): Promise<Homework[]> {
  if (!entryId) return [];
  const client = createClient();
  const gardes = items.filter((item) => item.description.trim().length > 0);
  const conserves = new Set(gardes.map((item) => item.id).filter(Boolean));

  for (const ancien of await loadHomework(entryId)) {
    if (conserves.has(ancien.id)) continue;
    const result = await client
      .from("lesson_book_homework")
      .delete()
      .eq("id", ancien.id)
      .select("id");
    confirmWrite(result, "le retrait de ce travail à effectuer");
  }

  for (let rang = 0; rang < gardes.length; rang += 1) {
    const item = gardes[rang];
    const payload = {
      entry_id: entryId,
      school_id: schoolId,
      description_html: plainToRichText(item.description),
      // « null » et non chaîne vide : la colonne est une date, et « » n'en est
      // pas une.
      due_date: item.dueDate || null,
      submission_mode: item.mode,
      duration_minutes:
        item.durationMinutes && item.durationMinutes > 0 ? Math.round(item.durationMinutes) : null,
      position: rang,
    };
    if (item.id) {
      const result = await client
        .from("lesson_book_homework")
        .update(payload)
        .eq("id", item.id)
        .select("id");
      confirmWrite(result, "l’enregistrement de ce travail à effectuer");
    } else {
      const { error } = await client.from("lesson_book_homework").insert(payload).select("id");
      if (error) throw new Error(describe(error));
    }
  }

  return loadHomework(entryId);
}

/* ===================================================================
 * Les fiches rattachées à une séance.
 *
 * C'est la « pièce jointe » du cahier de textes, et elle ne téléverse rien :
 * la fiche pédagogique existe déjà en base. La rattacher, c'est la désigner.
 * L'établissement n'a donc besoin d'aucun espace de stockage, et la famille
 * ouvre la fiche telle que l'enseignant l'a écrite.
 * =================================================================== */

export type TeacherPlan = {
  id: string;
  title: string;
  status: string;
  weekNumber: number | null;
};

/** Les fiches de l'enseignant, les plus récentes d'abord. */
export async function loadTeacherPlans(teacherId: string): Promise<TeacherPlan[]> {
  if (!teacherId) return [];
  const { data, error } = await createClient()
    .from("lesson_plans")
    .select("id,title,status,week_number,updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(describe(error));
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: String(row.title || "Fiche sans titre"),
    status: String(row.status || "draft"),
    weekNumber:
      row.week_number === null || row.week_number === undefined
        ? null
        : Number(row.week_number),
  }));
}

export type Attachment = { planId: string; title: string };

export async function loadAttachments(entryId: string): Promise<Attachment[]> {
  if (!entryId) return [];
  const { data, error } = await createClient()
    .from("lesson_book_attachments")
    .select("lesson_plan_id,lesson_plans(title)")
    .eq("entry_id", entryId);
  if (error) throw new Error(describe(error));
  type Row = { lesson_plan_id: string; lesson_plans?: { title?: string } | null };
  return ((data || []) as unknown as Row[]).map((row) => ({
    planId: String(row.lesson_plan_id || ""),
    title: String(row.lesson_plans?.title || "Fiche"),
  }));
}

export async function attachPlan(entryId: string, planId: string): Promise<void> {
  // La table ne porte pas de « school_id » : elle tient l'établissement de la
  // séance à laquelle elle se rattache, et le dupliquer aurait ouvert la
  // possibilité de deux valeurs contradictoires.
  const { error } = await createClient()
    .from("lesson_book_attachments")
    .insert({ entry_id: entryId, lesson_plan_id: planId });
  // Rattacher deux fois la même fiche n'est pas une faute : la contrainte
  // d'unicité l'empêche, et l'utilisateur n'a pas à en être averti.
  if (error && !String(error.message || "").includes("duplicate")) {
    throw new Error(describe(error));
  }
}

export async function detachPlan(entryId: string, planId: string): Promise<void> {
  const result = await createClient()
    .from("lesson_book_attachments")
    .delete()
    .eq("entry_id", entryId)
    .eq("lesson_plan_id", planId)
    .select("id");
  confirmWrite(result, "le retrait de cette fiche");
}

/* ===================================================================
 * Les fichiers joints à une séance.
 *
 * Le seau est privé : la lecture passe par une adresse signée, valable
 * quelques minutes. Un seau public rendrait chaque devoir consultable par
 * quiconque devine ou reçoit un lien, sans connexion.
 * =================================================================== */

const SEAU = "cahier-de-textes";

/** 10 Mo : assez pour un sujet scanné, assez peu pour une connexion d'école. */
export const LESSON_FILE_MAX_BYTES = 10 * 1024 * 1024;

export type LessonFile = {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Un nom de fichier utilisable comme clé de stockage.
 *
 * Les accents, les espaces et les apostrophes d'un « Contrôle n°2 — l'accord
 * du participe.pdf » produisent des clés fragiles selon les outils qui les
 * relisent. Le nom d'origine est conservé dans le registre et c'est lui qui
 * s'affiche ; seule la clé technique est simplifiée.
 */
function cleDeFichier(nom: string): string {
  return (
    String(nom || "fichier")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(-80) || "fichier"
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export async function loadLessonFiles(entryId: string): Promise<LessonFile[]> {
  if (!entryId) return [];
  const { data, error } = await createClient()
    .from("lesson_book_files")
    .select("id,storage_path,file_name,mime_type,size_bytes")
    .eq("entry_id", entryId)
    .order("created_at");
  if (error) throw new Error(describe(error));
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    path: String(row.storage_path || ""),
    name: String(row.file_name || "Fichier"),
    mimeType: String(row.mime_type || ""),
    sizeBytes: Number(row.size_bytes || 0),
  }));
}

/**
 * Dépose un fichier et l'inscrit au registre.
 *
 * L'ordre compte : les octets d'abord, le registre ensuite. Inscrire d'abord
 * laisserait une ligne pointant vers un fichier inexistant si l'envoi échouait
 * — et l'écran promettrait une pièce jointe introuvable.
 */
export async function uploadLessonFile(
  entryId: string,
  schoolId: string,
  file: File,
): Promise<void> {
  if (file.size > LESSON_FILE_MAX_BYTES) {
    throw new Error(
      `« ${file.name} » pèse ${formatFileSize(file.size)}. La limite est de ${formatFileSize(
        LESSON_FILE_MAX_BYTES,
      )} par fichier.`,
    );
  }
  const client = createClient();
  const { data: auth } = await client.auth.getUser();
  // Le chemin porte l'établissement puis la séance : c'est de ce deuxième
  // dossier que le serveur déduit qui a le droit de lire le fichier.
  const chemin = `${schoolId}/${entryId}/${crypto.randomUUID()}-${cleDeFichier(file.name)}`;

  const envoi = await client.storage.from(SEAU).upload(chemin, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (envoi.error) throw new Error(describe(envoi.error));

  const { error } = await client.from("lesson_book_files").insert({
    entry_id: entryId,
    school_id: schoolId,
    storage_path: chemin,
    file_name: file.name,
    mime_type: file.type || "",
    size_bytes: file.size,
    uploaded_by: auth.user?.id || null,
  });
  if (error) {
    // Le registre a refusé : on retire les octets plutôt que de laisser un
    // fichier orphelin occuper l'espace sans que rien ne le désigne.
    await client.storage.from(SEAU).remove([chemin]);
    throw new Error(describe(error));
  }
}

export async function deleteLessonFile(fichier: LessonFile): Promise<void> {
  const client = createClient();
  const result = await client
    .from("lesson_book_files")
    .delete()
    .eq("id", fichier.id)
    .select("id");
  confirmWrite(result, "la suppression de cette pièce jointe");
  // Les octets ensuite : si le retrait du seau échoue, la ligne a déjà
  // disparu et le fichier n'est plus atteignable par personne.
  await client.storage.from(SEAU).remove([fichier.path]);
}

/**
 * Une adresse de lecture, valable une heure.
 *
 * Assez pour ouvrir ou télécharger le document ; assez peu pour qu'un lien
 * recopié ailleurs cesse vite de fonctionner.
 */
export async function lessonFileUrl(path: string): Promise<string> {
  const { data, error } = await createClient().storage.from(SEAU).createSignedUrl(path, 3600);
  if (error) throw new Error(describe(error));
  return String(data?.signedUrl || "");
}
