import { describe, expect, it } from "vitest";
import { isPublished, type ReportPublication } from "./publication";

const PUBLIEES: ReportPublication[] = [
  { classId: "c1", periodId: "p1", publishedAt: "2026-08-26T10:00:00Z" },
  { classId: "c2", periodId: "p1", publishedAt: "2026-08-26T11:00:00Z" },
];

describe("état de publication", () => {
  it("reconnaît une classe et une période publiées", () => {
    expect(isPublished(PUBLIEES, "c1", "p1")).toBe(true);
  });

  /**
   * La publication porte sur un couple classe-période. Publier le palier 1 de
   * la 4e année ne publie pas celui de la 5e, ni le palier 2 de la même classe.
   */
  it("ne déborde pas sur une autre période de la même classe", () => {
    expect(isPublished(PUBLIEES, "c1", "p2")).toBe(false);
  });

  it("ne déborde pas sur une autre classe de la même période", () => {
    expect(isPublished(PUBLIEES, "c3", "p1")).toBe(false);
  });

  it("répond faux quand rien n’est publié", () => {
    expect(isPublished([], "c1", "p1")).toBe(false);
  });

  it("répond faux sur une classe ou une période absente", () => {
    expect(isPublished(PUBLIEES, "", "p1")).toBe(false);
    expect(isPublished(PUBLIEES, "c1", "")).toBe(false);
  });
});
