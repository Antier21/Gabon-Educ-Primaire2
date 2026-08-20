"use client";

import { readLocal, STORAGE_KEYS, writeLocal } from "@/lib/storage-mode";
export type NotificationKind =
  | "invitation"
  | "score_published"
  | "report_published"
  | "attendance"
  | "document"
  | "announcement"
  | "sync_conflict"
  | "import_error"
  | "period_lock"
  | "report_incomplete"
  | "timetable_change";
export type InternalNotification = {
  id: string;
  schoolId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};
export function readNotifications() {
  return readLocal<InternalNotification[]>(STORAGE_KEYS.notifications, []);
}
export function createNotification(
  input: Omit<InternalNotification, "id" | "readAt" | "createdAt">,
) {
  const notification: InternalNotification = {
    ...input,
    id: crypto.randomUUID(),
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  writeLocal(
    STORAGE_KEYS.notifications,
    [notification, ...readNotifications()].slice(0, 500),
  );
  return notification;
}
export function markNotificationRead(id: string) {
  const time = new Date().toISOString(),
    items = readNotifications().map((item) =>
      item.id === id ? { ...item, readAt: item.readAt || time } : item,
    );
  writeLocal(STORAGE_KEYS.notifications, items);
  return items;
}
export function markAllNotificationsRead(userId: string) {
  const time = new Date().toISOString(),
    items = readNotifications().map((item) =>
      item.userId === userId ? { ...item, readAt: item.readAt || time } : item,
    );
  writeLocal(STORAGE_KEYS.notifications, items);
  return items;
}
export function deleteNotification(id: string) {
  const items = readNotifications().filter((item) => item.id !== id);
  writeLocal(STORAGE_KEYS.notifications, items);
  return items;
}
export function filterNotifications(filters: {
  userId: string;
  unreadOnly?: boolean;
  kind?: NotificationKind;
}) {
  return readNotifications().filter(
    (item) =>
      item.userId === filters.userId &&
      (!filters.unreadOnly || !item.readAt) &&
      (!filters.kind || item.kind === filters.kind),
  );
}
export function unreadNotificationCount(userId: string) {
  return filterNotifications({ userId, unreadOnly: true }).length;
}
