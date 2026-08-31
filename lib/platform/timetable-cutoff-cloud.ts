"use client";

import { createClient } from "@/lib/supabase/client";
import { isTimetableSlotWithinDay } from "@/lib/platform/timetable-hours";
import type { PlatformWorkspace } from "@/lib/platform/types";

const CHUNK_SIZE = 40;

function describe(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [raw.message, raw.details]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
    const code = typeof raw.code === "string" && raw.code ? ` (code ${raw.code})` : "";
    if (parts.length) return `${parts.join(" — ")}${code}`;
  }
  return "Erreur Supabase inconnue.";
}

export async function removeLateTimetableSlotsFromCloud(workspace: PlatformWorkspace) {
  const schoolId = workspace.school?.id || "";
  if (!schoolId || schoolId === "local") return 0;

  const lateIds = workspace.timetable
    .filter((slot) => !isTimetableSlotWithinDay(slot.startsAt, slot.endsAt))
    .map((slot) => slot.id)
    .filter(Boolean);
  if (!lateIds.length) return 0;

  const client = createClient();
  let removed = 0;
  for (let index = 0; index < lateIds.length; index += CHUNK_SIZE) {
    const ids = lateIds.slice(index, index + CHUNK_SIZE);
    const { error } = await client
      .from("timetable_slots")
      .delete()
      .eq("school_id", schoolId)
      .in("id", ids);
    if (error) {
      throw new Error(`Suppression des anciens créneaux après 14 h 30 refusée : ${describe(error)}`);
    }
    removed += ids.length;
  }
  return removed;
}
