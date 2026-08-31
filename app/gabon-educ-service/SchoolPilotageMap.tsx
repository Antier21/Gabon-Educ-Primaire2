"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Crosshair, LocateFixed, MapPin, Navigation, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./SchoolPilotageMap.module.css";

export type PilotageMapSchool = {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: string | null;
  locationUpdatedAt: string | null;
};

type LocationPatch = {
  latitude: number | null;
  longitude: number | null;
  locationSource: string | null;
  locationUpdatedAt: string | null;
};

type MarkerLike = {
  addTo(target: unknown): MarkerLike;
  bindPopup(html: string): MarkerLike;
  on(event: string, handler: () => void): MarkerLike;
  openPopup(): MarkerLike;
  setLatLng(point: [number, number]): MarkerLike;
};
type LayerGroupLike = { addTo(map: MapLike): LayerGroupLike; clearLayers(): void };
type MapLike = {
  setView(point: [number, number], zoom: number, options?: Record<string, unknown>): MapLike;
  fitBounds(bounds: unknown, options?: Record<string, unknown>): MapLike;
  on(event: string, handler: (event: { latlng?: { lat: number; lng: number } }) => void): MapLike;
  off(event: string, handler: (event: { latlng?: { lat: number; lng: number } }) => void): MapLike;
  invalidateSize(): void;
  remove(): void;
};
type LeafletNamespace = {
  map(element: HTMLElement, options?: Record<string, unknown>): MapLike;
  tileLayer(url: string, options?: Record<string, unknown>): { addTo(map: MapLike): unknown };
  marker(point: [number, number], options?: Record<string, unknown>): MarkerLike;
  divIcon(options: Record<string, unknown>): unknown;
  layerGroup(): LayerGroupLike;
  latLngBounds(points: Array<[number, number]>): unknown;
};

declare global {
  interface Window {
    L?: LeafletNamespace;
  }
}

const GABON_CENTER: [number, number] = [-0.62, 11.72];
let leafletPromise: Promise<LeafletNamespace> | null = null;

const CITY_POINTS: Record<string, [number, number]> = {
  libreville: [0.4162, 9.4673],
  owendo: [0.283, 9.5],
  akanda: [0.579, 9.363],
  ntoum: [0.39, 9.76],
  kango: [0.188, 10.095],
  cocobeach: [1.0, 9.58],
  "port-gentil": [-0.7193, 8.7815],
  portgentil: [-0.7193, 8.7815],
  lambarene: [-0.7001, 10.2405],
  franceville: [-1.6333, 13.5833],
  moanda: [-1.565, 13.2],
  oyem: [1.5993, 11.5793],
  bitam: [2.075, 11.5],
  makokou: [0.5738, 12.8642],
  koulamoutou: [-1.1367, 12.463],
  lastoursville: [-0.814, 12.708],
  mouila: [-1.8685, 11.0559],
  tchibanga: [-2.8574, 11.027],
  gamba: [-2.65, 10.0],
  ndende: [-2.4, 11.36],
  fougamou: [-1.215, 10.583],
  lebamba: [-2.212, 11.481],
  mitzic: [0.783, 11.55],
  medouneu: [1.0, 10.95],
  minvoul: [2.15, 12.13],
};

const PROVINCE_POINTS: Record<string, [number, number]> = {
  estuaire: [0.35, 9.75],
  "haut-ogooue": [-1.45, 13.45],
  "moyen-ogooue": [-0.45, 10.55],
  ngounie: [-1.65, 11.15],
  nyanga: [-2.65, 11.0],
  "ogooue-ivindo": [0.25, 12.85],
  "ogooue-lolo": [-0.95, 12.6],
  "ogooue-maritime": [-1.25, 9.35],
  "woleu-ntem": [1.45, 11.65],
};

function normalizePlace(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

function jitter(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  const lat = (((hash & 255) / 255) - 0.5) * 0.055;
  const lng = ((((hash >> 8) & 255) / 255) - 0.5) * 0.055;
  return [lat, lng] as const;
}

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value);
}

function resolvePoint(school: PilotageMapSchool) {
  if (finite(school.latitude) && finite(school.longitude)) {
    return { point: [school.latitude!, school.longitude!] as [number, number], precision: "exact" as const };
  }
  const city = CITY_POINTS[normalizePlace(school.city)];
  if (city) {
    const offset = jitter(school.id);
    return { point: [city[0] + offset[0], city[1] + offset[1]] as [number, number], precision: "city" as const };
  }
  const province = PROVINCE_POINTS[normalizePlace(school.province)];
  if (province) {
    const offset = jitter(school.id);
    return { point: [province[0] + offset[0] * 2, province[1] + offset[1] * 2] as [number, number], precision: "province" as const };
  }
  return null;
}

function statusColor(status: string) {
  if (status === "active" || status === "trial") return "#27965e";
  if (status === "grace_period") return "#e2aa27";
  if (["suspended", "expired", "cancelled"].includes(status)) return "#d34747";
  return "#6a7b72";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    trial: "Essai",
    active: "Actif",
    grace_period: "Délai",
    suspended: "Suspendu",
    expired: "Expiré",
    cancelled: "Résilié",
  };
  return labels[status] || status;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}

function ensureLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("Carte indisponible côté serveur."));
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise<LeafletNamespace>((resolve, reject) => {
    if (!document.getElementById("geps-leaflet-css")) {
      const link = document.createElement("link");
      link.id = "geps-leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const existing = document.getElementById("geps-leaflet-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => window.L ? resolve(window.L) : reject(new Error("Leaflet non chargé.")), { once: true });
      existing.addEventListener("error", () => reject(new Error("Impossible de charger le moteur cartographique.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "geps-leaflet-js";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => window.L ? resolve(window.L) : reject(new Error("Leaflet non chargé."));
    script.onerror = () => reject(new Error("Impossible de charger le moteur cartographique."));
    document.body.appendChild(script);
  });

  return leafletPromise;
}

function numberFromInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function SchoolPilotageMap({
  schools,
  selectedSchoolId,
  onSelectSchool,
  onLocationSaved,
  locationStorageReady,
}: {
  schools: PilotageMapSchool[];
  selectedSchoolId: string;
  onSelectSchool: (schoolId: string) => void;
  onLocationSaved: (schoolId: string, patch: LocationPatch) => void;
  locationStorageReady: boolean;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLike | null>(null);
  const leafletRef = useRef<LeafletNamespace | null>(null);
  const markerLayerRef = useRef<LayerGroupLike | null>(null);
  const markerRefs = useRef<Map<string, MarkerLike>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const selected = schools.find((school) => school.id === selectedSchoolId) || null;
  const located = useMemo(() => schools.map((school) => ({ school, resolved: resolvePoint(school) })).filter((item) => item.resolved), [schools]);
  const exactCount = schools.filter((school) => finite(school.latitude) && finite(school.longitude)).length;
  const approxCount = located.length - exactCount;
  const missingCount = schools.length - located.length;

  useEffect(() => {
    if (!selected) {
      setLatitude("");
      setLongitude("");
      return;
    }
    setLatitude(finite(selected.latitude) ? selected.latitude!.toFixed(6) : "");
    setLongitude(finite(selected.longitude) ? selected.longitude!.toFixed(6) : "");
    setMessage("");
    setSuccess(false);
    setPlacing(false);
  }, [selectedSchoolId, selected?.latitude, selected?.longitude]);

  useEffect(() => {
    let cancelled = false;
    void ensureLeaflet()
      .then((leaflet) => {
        if (cancelled || !mapElementRef.current || mapRef.current) return;
        leafletRef.current = leaflet;
        const map = leaflet.map(mapElementRef.current, { zoomControl: true, minZoom: 5, maxZoom: 18 }).setView(GABON_CENTER, 6);
        leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;
        markerLayerRef.current = leaflet.layerGroup().addTo(map);
        setMapReady(true);
        window.setTimeout(() => map.invalidateSize(), 80);
      })
      .catch((error) => {
        if (!cancelled) setMapError(error instanceof Error ? error.message : "Carte indisponible.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !leafletRef.current || !mapRef.current || !markerLayerRef.current) return;
    const leaflet = leafletRef.current;
    const layer = markerLayerRef.current;
    layer.clearLayers();
    markerRefs.current.clear();

    const points: Array<[number, number]> = [];
    for (const item of located) {
      if (!item.resolved) continue;
      const { school } = item;
      const { point, precision } = item.resolved;
      points.push(point);
      const color = statusColor(school.status);
      const markerClasses = [
        styles.marker,
        precision !== "exact" ? styles.markerApprox : "",
        school.id === selectedSchoolId ? styles.markerSelected : "",
      ].filter(Boolean).join(" ");
      const icon = leaflet.divIcon({
        className: styles.markerHost,
        html: `<span class="${markerClasses}" style="background:${color}"></span>`,
        iconSize: school.id === selectedSchoolId ? [30, 30] : [24, 24],
        iconAnchor: school.id === selectedSchoolId ? [15, 28] : [12, 23],
        popupAnchor: [0, -24],
      });
      const precisionText = precision === "exact" ? "Position GPS enregistrée" : precision === "city" ? "Position approximative · ville" : "Position approximative · province";
      const marker = leaflet.marker(point, { icon })
        .addTo(layer)
        .bindPopup(`<div class="${styles.leafletPopup}"><strong>${escapeHtml(school.name)}</strong><small>${escapeHtml([school.city, school.province].filter(Boolean).join(", ") || "Localisation à préciser")}</small><small>${escapeHtml(statusLabel(school.status))}</small>${precision === "exact" ? "" : `<em>${precisionText}</em>`}</div>`)
        .on("click", () => onSelectSchool(school.id));
      markerRefs.current.set(school.id, marker);
    }

    if (points.length === 1) mapRef.current.setView(points[0], 12);
    else if (points.length > 1) mapRef.current.fitBounds(leaflet.latLngBounds(points), { padding: [38, 38], maxZoom: 11 });
    else mapRef.current.setView(GABON_CENTER, 6);
  }, [located, mapReady, onSelectSchool, selectedSchoolId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !selected) return;
    const resolved = resolvePoint(selected);
    if (resolved) {
      mapRef.current.setView(resolved.point, resolved.precision === "exact" ? 14 : 10, { animate: true });
      markerRefs.current.get(selected.id)?.openPopup();
    }
  }, [mapReady, selectedSchoolId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !placing || !selected) return;
    const handleMapClick = (event: { latlng?: { lat: number; lng: number } }) => {
      if (!event.latlng) return;
      const nextLat = event.latlng.lat;
      const nextLng = event.latlng.lng;
      setLatitude(nextLat.toFixed(6));
      setLongitude(nextLng.toFixed(6));
      markerRefs.current.get(selected.id)?.setLatLng([nextLat, nextLng]);
      setPlacing(false);
      setMessage("Position choisie. Clique sur « Enregistrer la position » pour la confirmer.");
      setSuccess(false);
    };
    map.on("click", handleMapClick);
    return () => map.off("click", handleMapClick);
  }, [placing, selected, mapReady]);

  async function saveLocation() {
    if (!selected || !locationStorageReady) return;
    const lat = numberFromInput(latitude);
    const lng = numberFromInput(longitude);
    if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
      setMessage("Indique une latitude et une longitude valides.");
      setSuccess(false);
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setMessage("Les coordonnées saisies sont hors limites.");
      setSuccess(false);
      return;
    }
    setSaving(true);
    setMessage("");
    const { data, error } = await createClient().rpc("set_school_location", {
      p_school_id: selected.id,
      p_latitude: lat,
      p_longitude: lng,
      p_source: "map",
    });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setSuccess(false);
      return;
    }
    const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
    const updatedAt = String(row?.location_updated_at || new Date().toISOString());
    onLocationSaved(selected.id, {
      latitude: Number(row?.latitude ?? lat),
      longitude: Number(row?.longitude ?? lng),
      locationSource: String(row?.location_source || "map"),
      locationUpdatedAt: updatedAt,
    });
    setMessage("Position exacte enregistrée dans le Centre de pilotage.");
    setSuccess(true);
  }

  async function clearLocation() {
    if (!selected || !locationStorageReady || !finite(selected.latitude)) return;
    setSaving(true);
    setMessage("");
    const { error } = await createClient().rpc("set_school_location", {
      p_school_id: selected.id,
      p_latitude: null,
      p_longitude: null,
      p_source: "manual",
    });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setSuccess(false);
      return;
    }
    onLocationSaved(selected.id, { latitude: null, longitude: null, locationSource: null, locationUpdatedAt: null });
    setLatitude("");
    setLongitude("");
    setMessage("Position exacte supprimée. La carte revient au repère approximatif de la ville ou de la province.");
    setSuccess(true);
  }

  function useApproximatePoint() {
    if (!selected) return;
    const resolved = resolvePoint({ ...selected, latitude: null, longitude: null });
    if (!resolved) {
      setMessage("Aucun repère automatique n’est disponible pour cette ville ou cette province.");
      setSuccess(false);
      return;
    }
    setLatitude(resolved.point[0].toFixed(6));
    setLongitude(resolved.point[1].toFixed(6));
    markerRefs.current.get(selected.id)?.setLatLng(resolved.point);
    mapRef.current?.setView(resolved.point, 11, { animate: true });
    setMessage("Repère approximatif chargé. Tu peux cliquer sur la carte pour l’ajuster avant d’enregistrer.");
    setSuccess(false);
  }

  const selectedResolved = selected ? resolvePoint(selected) : null;
  const exactSelected = Boolean(selected && finite(selected.latitude) && finite(selected.longitude));
  const selectedStatusClass = selected?.status === "active" || selected?.status === "trial"
    ? styles.statusActive
    : selected?.status === "grace_period"
      ? styles.statusGrace
      : ["suspended", "expired", "cancelled"].includes(selected?.status || "")
        ? styles.statusDanger
        : "";

  return (
    <section className={styles.panel} aria-label="Carte nationale des établissements">
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={styles.titleIcon}><MapPin /></span>
          <div>
            <h2>Carte nationale des établissements</h2>
            <p>Visualise le réseau Gabon Éduc+ sur le territoire. Les repères dorés sont approximatifs tant que la position GPS exacte n’a pas été enregistrée.</p>
          </div>
        </div>
        <div className={styles.stats}>
          <span className={`${styles.stat} ${styles.exact}`}><i className={styles.statDot} />{exactCount} exact(s)</span>
          <span className={`${styles.stat} ${styles.approx}`}><i className={styles.statDot} />{approxCount} approximatif(s)</span>
          <span className={styles.stat}><i className={styles.statDot} />{missingCount} à localiser</span>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.mapShell}>
          <div ref={mapElementRef} className={styles.map} />
          {!mapReady && <div className={styles.mapPlaceholder}><div><Navigation /><b>{mapError || "Chargement de la carte du Gabon…"}</b></div></div>}
          {placing && <div className={styles.placeMode}>Clique sur la carte à l’emplacement exact de l’établissement</div>}
          <div className={styles.legend}>
            <span><i className={styles.active} />Actif / essai</span>
            <span><i className={styles.grace} />Délai</span>
            <span><i className={styles.suspended} />Suspendu / expiré</span>
            <span><i className={styles.other} />Autre statut</span>
          </div>
        </div>

        <aside className={styles.side}>
          {!selected ? (
            <div className={styles.emptySide}><MapPin /><p>Sélectionne un établissement sur la carte ou dans la liste.</p></div>
          ) : (
            <>
              <div className={styles.schoolHead}>
                <div><h3>{selected.name}</h3><p>{[selected.city, selected.province].filter(Boolean).join(", ") || "Localisation administrative non renseignée"}</p></div>
                <span className={`${styles.status} ${selectedStatusClass}`}>{statusLabel(selected.status)}</span>
              </div>

              <div className={styles.locationState}>
                <strong>{exactSelected ? <CheckCircle2 /> : <LocateFixed />}{exactSelected ? "Position GPS exacte" : selectedResolved ? "Repère approximatif disponible" : "Position à définir"}</strong>
                <p>{exactSelected ? `Dernière mise à jour : ${selected.locationUpdatedAt ? new Date(selected.locationUpdatedAt).toLocaleString("fr-FR") : "date inconnue"}.` : selectedResolved ? "Le marqueur est actuellement placé à partir de la ville ou de la province. Définis sa position exacte pour fiabiliser la carte." : "La ville ou la province ne permet pas de placer automatiquement cet établissement. Clique directement sur la carte."}</p>
              </div>

              <div className={styles.coords}>
                <label>Latitude<input inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="Ex. 0.416200" /></label>
                <label>Longitude<input inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="Ex. 9.467300" /></label>
              </div>

              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={useApproximatePoint}><LocateFixed />Partir du repère ville/province</button>
                <button type="button" className={styles.secondary} onClick={() => { setPlacing(true); setMessage(""); }} disabled={!mapReady}><Crosshair />Placer précisément sur la carte</button>
                <button type="button" className={styles.primary} onClick={() => void saveLocation()} disabled={!locationStorageReady || saving}><MapPin />{saving ? "Enregistrement…" : "Enregistrer la position"}</button>
                {exactSelected && <button type="button" className={styles.dangerButton} onClick={() => void clearLocation()} disabled={!locationStorageReady || saving}><Trash2 />Retirer la position exacte</button>}
              </div>

              {!locationStorageReady && <div className={styles.migration}>La carte fonctionne déjà en mode approximatif. Pour enregistrer les coordonnées exactes, applique la migration <b>109_school_geolocation.sql</b> à Supabase.</div>}
              {message && <div className={`${styles.message} ${success ? styles.success : ""}`}>{message}</div>}
              <p className={styles.tip}>Conseil : zoome sur le quartier, clique sur « Placer précisément sur la carte », puis clique sur le bâtiment de l’établissement. Aucune localisation d’élève, de parent ou d’enseignant n’est enregistrée.</p>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
