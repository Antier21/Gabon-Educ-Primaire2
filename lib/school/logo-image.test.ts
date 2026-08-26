import { describe, expect, it } from "vitest";
import {
  dataUriBytes,
  describeLogoValue,
  fitWithin,
  formatBytes,
  isAcceptedLogoType,
  LOGO_MAX_EDGE,
} from "./logo-image";

describe("fitWithin", () => {
  it("réduit en gardant les proportions", () => {
    expect(fitWithin(1024, 512)).toEqual({ width: 256, height: 128 });
    expect(fitWithin(512, 1024)).toEqual({ width: 128, height: 256 });
  });

  it("n’agrandit jamais une image déjà petite", () => {
    expect(fitWithin(120, 90)).toEqual({ width: 120, height: 90 });
  });

  it("garde au moins un pixel sur une image très allongée", () => {
    const size = fitWithin(4000, 3, LOGO_MAX_EDGE);
    expect(size.width).toBe(256);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });

  it("ne casse pas sur des dimensions absentes", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("dataUriBytes", () => {
  it("déduit le poids réel de la charge base64", () => {
    // « AAAA » en base64 vaut trois octets.
    expect(dataUriBytes("data:image/png;base64,AAAA")).toBe(3);
    expect(dataUriBytes("data:image/png;base64,AAA=")).toBe(2);
    expect(dataUriBytes("data:image/png;base64,AA==")).toBe(1);
  });

  it("rend zéro sur une valeur qui n’est pas un data:URI", () => {
    expect(dataUriBytes("https://exemple.ga/logo.png")).toBe(0);
    expect(dataUriBytes("")).toBe(0);
  });
});

describe("isAcceptedLogoType", () => {
  it("accepte les formats d’image courants", () => {
    expect(isAcceptedLogoType("image/png")).toBe(true);
    expect(isAcceptedLogoType("image/svg+xml")).toBe(true);
  });

  it("refuse ce qui n’est pas une image", () => {
    expect(isAcceptedLogoType("application/pdf")).toBe(false);
    expect(isAcceptedLogoType("")).toBe(false);
  });
});

describe("describeLogoValue", () => {
  it("distingue une image intégrée d’une adresse web", () => {
    expect(describeLogoValue("")).toBe("Aucun logo.");
    expect(describeLogoValue("data:image/png;base64,AAAA")).toContain("sans connexion");
    expect(describeLogoValue("https://exemple.ga/logo.png")).toContain("inaccessible");
  });
});

describe("formatBytes", () => {
  it("lit en octets, kilo-octets et méga-octets", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(43_000)).toBe("42 ko");
    expect(formatBytes(2_600_000)).toBe("2.5 Mo");
  });
});
