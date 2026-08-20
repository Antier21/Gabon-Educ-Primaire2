"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnvironment } from "@/lib/storage-mode";
import { resolveActiveSchoolContext } from "@/lib/active-school";

export type SubscriptionAccessState = {
  loading: boolean;
  blocked: boolean;
  schoolId: string;
  message: string;
  refresh: () => Promise<void>;
};

const BLOCKED_MESSAGE =
  "Votre établissement est suspendu. Les données restent consultables, mais les créations, modifications et suppressions sont désactivées jusqu’à la régularisation de l’abonnement.";

export function useSubscriptionAccess(): SubscriptionAccessState {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [schoolId, setSchoolId] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setBlocked(true);
    if (!hasSupabaseEnvironment()) {
      setSchoolId("");
      setBlocked(false);
      setMessage("");
      setLoading(false);
      return;
    }
    try {
      const context = await resolveActiveSchoolContext();
      setSchoolId(context.school.id);
      const { data, error } = await createClient().rpc("school_can_write_strict", {
        target_school: context.school.id,
      });
      if (error) throw error;
      const denied = data !== true;
      setBlocked(denied);
      setMessage(denied ? BLOCKED_MESSAGE : "");
    } catch (error) {
      setBlocked(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Vérification de l’abonnement impossible. Par sécurité, les modifications sont temporairement désactivées.",
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const onStorage = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("gabon-educ:subscription-changed", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("gabon-educ:subscription-changed", onStorage);
    };
  }, [refresh]);

  return { loading, blocked, schoolId, message, refresh };
}
