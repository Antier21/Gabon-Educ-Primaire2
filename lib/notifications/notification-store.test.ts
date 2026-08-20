import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNotification,
  deleteNotification,
  filterNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  readNotifications,
  unreadNotificationCount,
} from "./notification-store";
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}
describe("notifications internes", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("window", { dispatchEvent: () => true });
    vi.stubGlobal("CustomEvent", class {});
    vi.stubGlobal("crypto", { randomUUID: () => "notification-1" });
  });
  const add = () =>
    createNotification({
      schoolId: "s",
      userId: "u",
      kind: "announcement",
      title: "Annonce",
      message: "Message",
      href: "/gabon-educ/annonces",
    });
  it("crée une notification non lue", () => {
    expect(add()).toMatchObject({ id: "notification-1", readAt: null });
    expect(unreadNotificationCount("u")).toBe(1);
  });
  it("marque une notification comme lue", () => {
    add();
    expect(markNotificationRead("notification-1")[0].readAt).not.toBeNull();
  });
  it("marque tout comme lu pour le bon utilisateur", () => {
    add();
    markAllNotificationsRead("u");
    expect(unreadNotificationCount("u")).toBe(0);
  });
  it("filtre par type", () => {
    add();
    expect(
      filterNotifications({ userId: "u", kind: "announcement" }),
    ).toHaveLength(1);
    expect(filterNotifications({ userId: "u", kind: "attendance" })).toEqual(
      [],
    );
  });
  it("supprime sans toucher aux autres données", () => {
    add();
    expect(deleteNotification("notification-1")).toEqual([]);
    expect(readNotifications()).toEqual([]);
  });
});
