"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { publishTimetableToCloud } from "@/lib/platform/timetable-cloud";
import { removeLateTimetableSlotsFromCloud } from "@/lib/platform/timetable-cutoff-cloud";
import { isTimetableSlotWithinDay } from "@/lib/platform/timetable-hours";
import { readPlatformWorkspace } from "@/lib/platform/store";
import { STORAGE_KEYS } from "@/lib/storage-mode";

type PublicationState =
  | { kind: "idle"; message: string }
  | { kind: "syncing"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

/**
 * Pont entre la copie locale de l'EDT et la table relationnelle Supabase.
 *
 * L'administration travaille avec un workspace local pour rester utilisable
 * sur un réseau instable. Les espaces connectés lisent `timetable_slots`.
 * Cette passerelle garantit que les deux mondes ne divergent plus et applique
 * aussi la borne commune de 14 h 30 lors de la publication.
 */
export function TimetableCloudPublisher() {
  const [state, setState] = useState<PublicationState>({ kind: "idle", message: "" });
  const running = useRef(false);
  const rerun = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publish = useCallback(async () => {
    if (running.current) {
      rerun.current = true;
      return;
    }

    const workspace = readPlatformWorkspace();
    const slots = workspace.timetable.filter((slot) =>
      isTimetableSlotWithinDay(slot.startsAt, slot.endsAt),
    );
    const hasLateSlots = slots.length !== workspace.timetable.length;
    if (
      !workspace.school?.id ||
      workspace.school.id === "local" ||
      (!slots.length && !hasLateSlots)
    ) {
      setState({ kind: "idle", message: "" });
      return;
    }

    running.current = true;
    setState({ kind: "syncing", message: "Publication de l’emploi du temps dans Supabase…" });
    try {
      const removed = hasLateSlots
        ? await removeLateTimetableSlotsFromCloud(workspace)
        : 0;
      const count = slots.length
        ? await publishTimetableToCloud(workspace, slots)
        : 0;
      setState({
        kind: "success",
        message: `${count} créneau(x) confirmé(s) dans Supabase${removed ? ` · ${removed} ancien(s) créneau(x) après 14 h 30 supprimé(s)` : ""}. L’emploi du temps est disponible aux espaces connectés.`,
      });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "La publication de l’emploi du temps dans Supabase a échoué.",
      });
    } finally {
      running.current = false;
      if (rerun.current) {
        rerun.current = false;
        void publish();
      }
    }
  }, []);

  useEffect(() => {
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void publish(), 450);
    };

    // Répare aussi un EDT déjà créé avant ce correctif : aucune nouvelle
    // génération n'est nécessaire, la copie locale est publiée à l'ouverture.
    schedule();

    const onStorage = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === STORAGE_KEYS.timetable) schedule();
    };
    const onNativeStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.timetable) schedule();
    };

    window.addEventListener("gabon-educ:storage", onStorage);
    window.addEventListener("storage", onNativeStorage);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("gabon-educ:storage", onStorage);
      window.removeEventListener("storage", onNativeStorage);
    };
  }, [publish]);

  if (!state.message) return null;

  const error = state.kind === "error";
  const success = state.kind === "success";
  return (
    <div
      role={error ? "alert" : "status"}
      style={{
        maxWidth: 1450,
        margin: "12px auto 0",
        padding: "11px 15px",
        borderRadius: 10,
        border: error
          ? "1px solid #f2b5aa"
          : success
            ? "1px solid #b7dfcd"
            : "1px solid #d8dfdc",
        background: error ? "#fff1ee" : success ? "#eefaf4" : "#f7f9f8",
        color: error ? "#9a210c" : success ? "#056241" : "#52625b",
        fontSize: 12,
        fontWeight: 750,
      }}
    >
      {state.message}
    </div>
  );
}
