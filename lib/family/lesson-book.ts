"use client";

/**
 * Le cahier de textes, du côté de la famille.
 *
 * Ce module remplace une lecture qui visait la mauvaise table. L'espace
 * famille affichait jusqu'ici « lesson_plans » — les FICHES DE PRÉPARATION,
 * écrites avant le cours, pour l'usage propre de l'enseignant — sous le titre
 * « Cahiers de texte ». Or le cahier de textes est autre chose : il s'écrit
 * après la séance, il dit ce qui a effectivement eu lieu, et il ne parvient à
 * la famille qu'une fois REMIS par l'enseignant. C'est cette confusion que la
 * migration 091 avait séparée en deux tables ; l'écran de la famille était
 * resté du mauvais côté.
 *
 * Deux questions, et deux lectures distinctes :
 *
 * — « Qu'est-ce que tu dois faire pour demain ? » C'est la question du soir,
 *   posée dans toutes les familles, et elle porte sur les ÉCHÉANCES, toutes
 *   matières mêlées. On interroge donc les devoirs directement, filtrés par
 *   leur date de remise, sans charger les séances.
 *
 * — « Qu'avez-vous fait en classe ? » Celle-là porte sur une semaine, et c'est
 *   celle de l'élève qui a manqué le cours. On charge alors les séances d'une
 *   semaine, et d'une seule : une année entière de contenus rendrait l'écran
 *   inutilisable sur la connexion d'une famille.
 */

import { createClient } from "@/lib/supabase/client";
import { sanitizeRichText } from "@/lib/lesson-book/rich-text";
import { HOMEWORK_COLUMNS, homeworkFromRow, type Homework } from "@/lib/lesson-book/store";
import { formatDayLong, fromISODate, shortTime, toISODate } from "@/lib/lesson-book/week";

/** Un devoir, augmenté de ce qui permet à la famille de le situer. */
export type FamilyHomework = Homework & {
  entryId: string;
  subject: string;
  sessionDate: string;
};

export type FamilyAttachment = {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
};

/** Une fiche de préparation que l'enseignant a jointe à la séance. */
export type FamilyPlan = {
  id: string;
  title: string;
};

export type FamilySession = {
  id: string;
  date: string;
  startsAt: string;
  endsAt: string;
  subject: string;
  title: string;
  contentHtml: string;
  category: string;
  themes: string[];
  updatedAt: string;
  homework: FamilyHomework[];
  files: FamilyAttachment[];
  plans: FamilyPlan[];
};

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

/** Une date décalée de quelques jours, en « AAAA-MM-JJ » et sans temps universel. */
export function shiftISODate(iso: string, days: number): string {
  const base = fromISODate(iso);
  return toISODate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 12));
}

/* ===================================================================
 * Le classement des devoirs — sans base, donc vérifiable.
 * =================================================================== */

export type HomeworkBucket = {
  key: string;
  label: string;
  /** Une échéance dépassée se signale, sans accuser : la plateforme ne sait
   *  pas si le travail a été fait. */
  late: boolean;
  items: FamilyHomework[];
};

/**
 * Les devoirs rangés par échéance, dans l'ordre où la famille les lit.
 *
 * « Aujourd'hui » et « demain » sont nommés plutôt que datés : un parent qui
 * lit « pour le 27/08 » doit calculer, un parent qui lit « pour demain » sait.
 *
 * Les devoirs sans échéance ferment la liste au lieu d'être écartés : un
 * travail donné sans date reste un travail donné, et le supprimer de l'écran
 * reviendrait à décider à la place de l'enseignant qu'il n'existe pas.
 */
export function groupHomeworkByDue(items: FamilyHomework[], today: string): HomeworkBucket[] {
  const demain = shiftISODate(today, 1);
  const enRetard: FamilyHomework[] = [];
  const sansDate: FamilyHomework[] = [];
  const parDate = new Map<string, FamilyHomework[]>();

  for (const devoir of items) {
    if (!devoir.dueDate) {
      sansDate.push(devoir);
      continue;
    }
    if (devoir.dueDate < today) {
      enRetard.push(devoir);
      continue;
    }
    const liste = parDate.get(devoir.dueDate) || [];
    liste.push(devoir);
    parDate.set(devoir.dueDate, liste);
  }

  const blocs: HomeworkBucket[] = [];
  if (enRetard.length) {
    enRetard.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    blocs.push({ key: "retard", label: "Échéance dépassée", late: true, items: enRetard });
  }

  for (const date of [...parDate.keys()].sort()) {
    const label =
      date === today
        ? "Pour aujourd’hui"
        : date === demain
          ? "Pour demain"
          : `Pour le ${formatDayLong(fromISODate(date))}`;
    blocs.push({ key: date, label, late: false, items: parDate.get(date) || [] });
  }

  if (sansDate.length) {
    blocs.push({
      key: "sans-echeance",
      label: "Sans échéance précisée",
      late: false,
      items: sansDate,
    });
  }

  return blocs;
}

/* ===================================================================
 * Les lectures.
 * =================================================================== */

/**
 * Le travail à effectuer d'une classe, à partir d'aujourd'hui.
 *
 * On interroge la table des devoirs et non celle des séances, avec une
 * jointure interne qui sert de FILTRE : seules passent les lignes dont la
 * séance appartient à cette classe et a été remise. Le contenu des séances
 * n'est pas chargé — il pèse, et cet écran n'en montre rien.
 *
 * La fenêtre remonte de quelques jours en arrière plutôt que de s'arrêter à
 * aujourd'hui : un devoir dû hier soir et non rendu est encore le sujet du
 * matin.
 */
export async function loadFamilyHomework(
  classId: string,
  today: string,
  daysBack = 7,
): Promise<FamilyHomework[]> {
  if (!classId) return [];
  const depuis = shiftISODate(today, -Math.abs(daysBack));

  const { data, error } = await createClient()
    .from("lesson_book_homework")
    .select(
      `${HOMEWORK_COLUMNS},` +
        "lesson_book_entries!inner(session_date,is_published,class_group_id,school_subjects(label))",
    )
    .eq("lesson_book_entries.class_group_id", classId)
    .eq("lesson_book_entries.is_published", true)
    .gte("due_date", depuis)
    .order("due_date")
    .limit(120);
  if (error) throw new Error(describe(error));

  type Jointure = {
    session_date?: string;
    school_subjects?: { label?: string } | Array<{ label?: string }> | null;
  };

  return ((data || []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const brut = row.lesson_book_entries as Jointure | Jointure[] | null;
    // PostgREST rend l'objet joint tantôt seul, tantôt dans un tableau selon la
    // cardinalité qu'il déduit. Les deux formes doivent être acceptées.
    const seance = (Array.isArray(brut) ? brut[0] : brut) || {};
    const matiere = Array.isArray(seance.school_subjects)
      ? seance.school_subjects[0]
      : seance.school_subjects;
    return {
      ...homeworkFromRow(row),
      entryId: String(row.entry_id || ""),
      subject: String(matiere?.label || ""),
      sessionDate: String(seance.session_date || ""),
    };
  });
}

/**
 * Les dates de dernière modification des séances récemment remises.
 *
 * Sert uniquement à la pastille « nouveau » de l'onglet. Ne lit que la
 * colonne de date : compter ce qui a bougé ne demande pas de transporter les
 * contenus, et cette lecture-là part à chaque ouverture de l'espace.
 */
export async function loadFamilyLessonUpdates(
  classId: string,
  today: string,
  daysBack = 30,
): Promise<string[]> {
  if (!classId) return [];
  const { data, error } = await createClient()
    .from("lesson_book_entries")
    .select("updated_at")
    .eq("class_group_id", classId)
    .eq("is_published", true)
    .gte("session_date", shiftISODate(today, -Math.abs(daysBack)))
    .order("updated_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(describe(error));
  return ((data || []) as Array<{ updated_at?: string }>).map((row) => String(row.updated_at || ""));
}

/**
 * Les séances remises d'une classe, entre deux dates.
 *
 * Les brouillons sont écartés par la politique du serveur, pas ici : un filtre
 * posé dans le navigateur ne protège rien. Celui qui figure dans la requête ne
 * sert qu'à ne pas transporter ce que le serveur refuserait de toute façon.
 */
export async function loadFamilySessions(
  classId: string,
  fromISO: string,
  toISO: string,
): Promise<FamilySession[]> {
  if (!classId || !fromISO || !toISO) return [];
  const client = createClient();

  const { data, error } = await client
    .from("lesson_book_entries")
    .select(
      "id,session_date,starts_at,ends_at,title,content_html,category,themes,updated_at," +
        "school_subjects(label)",
    )
    .eq("class_group_id", classId)
    .eq("is_published", true)
    .gte("session_date", fromISO)
    .lte("session_date", toISO)
    .order("session_date")
    .order("starts_at");
  if (error) throw new Error(describe(error));

  const lignes = (data || []) as unknown as Array<Record<string, unknown>>;
  const identifiants = lignes.map((row) => String(row.id));
  if (!identifiants.length) return [];

  const [devoirs, fichiers, fiches] = await Promise.all([
    client.from("lesson_book_homework").select(HOMEWORK_COLUMNS).in("entry_id", identifiants).order("position"),
    client
      .from("lesson_book_files")
      .select("id,entry_id,storage_path,file_name,size_bytes")
      .in("entry_id", identifiants)
      .order("created_at"),
    client
      .from("lesson_book_attachments")
      .select("entry_id,lesson_plan_id,lesson_plans(title)")
      .in("entry_id", identifiants),
  ]);

  /*
   * Un refus sur les annexes ne doit pas emporter les séances.
   *
   * Le contenu du cours garde tout son sens sans la liste des pièces jointes ;
   * il n'en a aucun s'il ne s'affiche pas. On préfère donc une séance sans
   * annexes à un écran vide.
   */
  const parDevoir = new Map<string, Homework[]>();
  if (!devoirs.error) {
    for (const row of (devoirs.data || []) as unknown as Array<Record<string, unknown>>) {
      const cle = String(row.entry_id);
      parDevoir.set(cle, [...(parDevoir.get(cle) || []), homeworkFromRow(row)]);
    }
  }

  const parFichier = new Map<string, FamilyAttachment[]>();
  if (!fichiers.error) {
    for (const row of (fichiers.data || []) as unknown as Array<Record<string, unknown>>) {
      const cle = String(row.entry_id);
      parFichier.set(cle, [
        ...(parFichier.get(cle) || []),
        {
          id: String(row.id),
          name: String(row.file_name || "Fichier"),
          path: String(row.storage_path || ""),
          sizeBytes: Number(row.size_bytes || 0),
        },
      ]);
    }
  }

  const parFiche = new Map<string, FamilyPlan[]>();
  if (!fiches.error) {
    type Ligne = {
      entry_id: string;
      lesson_plan_id: string;
      lesson_plans?: { title?: string } | Array<{ title?: string }> | null;
    };
    for (const row of (fiches.data || []) as unknown as Ligne[]) {
      const cle = String(row.entry_id);
      const fiche = Array.isArray(row.lesson_plans) ? row.lesson_plans[0] : row.lesson_plans;
      parFiche.set(cle, [
        ...(parFiche.get(cle) || []),
        { id: String(row.lesson_plan_id), title: String(fiche?.title || "Fiche de préparation") },
      ]);
    }
  }

  return lignes.map((row) => {
    const id = String(row.id);
    const matiereBrute = row.school_subjects as
      | { label?: string }
      | Array<{ label?: string }>
      | null;
    const matiere = Array.isArray(matiereBrute) ? matiereBrute[0] : matiereBrute;
    const date = String(row.session_date || "");
    const sujet = String(matiere?.label || "");
    return {
      id,
      date,
      startsAt: shortTime(row.starts_at as string),
      endsAt: shortTime(row.ends_at as string),
      subject: sujet,
      title: String(row.title || ""),
      // Filtré à l'affichage autant qu'à l'écriture : c'est ici que le contenu
      // atteint des centaines de parents, et c'est la dernière barrière.
      contentHtml: sanitizeRichText(String(row.content_html || "")),
      category: String(row.category || ""),
      themes: Array.isArray(row.themes) ? (row.themes as string[]).map(String) : [],
      updatedAt: String(row.updated_at || ""),
      homework: (parDevoir.get(id) || []).map((devoir) => ({
        ...devoir,
        entryId: id,
        subject: sujet,
        sessionDate: date,
      })),
      files: parFichier.get(id) || [],
      plans: parFiche.get(id) || [],
    };
  });
}
