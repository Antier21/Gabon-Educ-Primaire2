export type SubscriptionStatus = "trial" | "active" | "grace_period" | "suspended" | "expired" | "cancelled";
export type SubscriptionSnapshot = {
  school_id: string; plan_code: string; status: SubscriptionStatus; effective_status: SubscriptionStatus;
  starts_at: string; expires_at: string; grace_period_ends_at: string | null; offline_licence_expires_at: string | null;
};
export const canWriteWithSubscription = (status: SubscriptionStatus) => ["trial","active","grace_period"].includes(status);
