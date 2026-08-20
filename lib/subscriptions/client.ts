import { createClient } from "@/lib/supabase/client";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import type { SubscriptionSnapshot } from "./types";
export async function loadCurrentSubscription(explicitSchoolId?: string): Promise<SubscriptionSnapshot | null> {
  const context = await resolveActiveSchoolContext();
  if (explicitSchoolId && explicitSchoolId !== context.school.id) {
    throw new Error("L’établissement demandé ne correspond pas à la session active.");
  }
  const schoolId = context.school.id;
  const client = createClient();
  const [{ data: subscription, error: subscriptionError }, { data: effectiveStatus, error: statusError }] = await Promise.all([
    client
      .from("school_subscriptions")
      .select("school_id,plan_code,status,starts_at,expires_at,grace_period_ends_at,offline_licence_expires_at")
      .eq("school_id", schoolId)
      .maybeSingle(),
    client.rpc("subscription_effective_status", { target_school: schoolId }),
  ]);
  if (subscriptionError) throw subscriptionError;
  if (statusError) throw statusError;
  if (!subscription) return null;
  return {
    ...(subscription as Omit<SubscriptionSnapshot, "effective_status">),
    effective_status: effectiveStatus as SubscriptionSnapshot["effective_status"],
  };
}
