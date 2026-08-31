"use client";

/* eslint-disable @next/next/no-img-element */

import {
  CheckCircle2,
  Crosshair,
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
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

type MapPoint = {
  point: [number, number];
  precision: "exact" | "city" | "province";
};

type Viewport = {
  latitude: number;
  longitude: number;
  zoom: number;
};

type MapSize = {
  width: number;
  height: number;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWorldX: number;
  startWorldY: number;
  zoom: number;
  moved: boolean;
};

type Tile = {
  key: string;
  left: number;
  top: number;
  url: string;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 5;
const MAX_ZOOM = 18;
const GABON_CENTER: [number, number] = [-0.62, 11.72];

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
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return [
    (((hash & 255) / 255) - 0.5) * 0.055,
    ((((hash >> 8) & 255) / 255) - 0.5) * 0.055,
  ] as const;
}

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value);
}

function resolvePoint(school: PilotageMapSchool): MapPoint | null {
  if (finite(school.latitude) && finite(school.longitude)) {
    return { point: [school.latitude!, school.longitude!], precision: "exact" };
  }
  const city = CITY_POINTS[normalizePlace(school.city)];
  if (city) {
    const offset = jitter(school.id);
    return { point: [city[0] + offset[0], city[1] + offset[1]], precision: "city" };
  }
  const province = PROVINCE_POINTS[normalizePlace(school.province)];
  if (province) {
    const offset = jitter(school.id);
    return { point: [province[0] + offset[0] * 2, province[1] + offset[1] * 2], precision: "province" };
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
    trial: "Essai", active: "Actif", grace_period: "Délai", suspended: "Suspendu",
    expired: "Expiré", cancelled: "Résilié",
  };
  return labels[status] || status;
}

function numberFromInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampLatitude(latitude: number) {
  return clamp(latitude, -85.05112878, 85.05112878);
}

function normalizeLongitude(longitude: number) {
  let normalized = longitude;
  while (normalized < -180) normalized += 360;
  while (normalized >= 180) normalized -= 360;
  return normalized;
}

function project(latitude: number, longitude: number, zoom: number) {
  const safeLatitude = clampLatitude(latitude);
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((normalizeLongitude(longitude) + 180) / 360) * scale;
  const sin = Math.sin((safeLatitude * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function unproject(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = normalizeLongitude((x / scale) * 360 - 180);
  const mercator = Math.PI - (2 * Math.PI * y) / scale;
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(mercator));
  return { latitude: clampLatitude(latitude), longitude };
}

function tilesFor(view: Viewport, size: MapSize): Tile[] {
  if (size.width <= 0 || size.height <= 0) return [];
  const center = project(view.latitude, view.longitude, view.zoom);
  const leftWorld = center.x - size.width / 2;
  const topWorld = center.y - size.height / 2;
  const minTileX = Math.floor(leftWorld / TILE_SIZE) - 1;
  const maxTileX = Math.floor((leftWorld + size.width) / TILE_SIZE) + 1;
  const minTileY = Math.floor(topWorld / TILE_SIZE) - 1;
  const maxTileY = Math.floor((topWorld + size.height) / TILE_SIZE) + 1;
  const tileCount = 2 ** view.zoom;
  const tiles: Tile[] = [];
  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= tileCount) continue;
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `${view.zoom}:${tileX}:${tileY}`,
        left: tileX * TILE_SIZE - leftWorld,
        top: tileY * TILE_SIZE - topWorld,
        url: `https://tile.openstreetmap.org/${view.zoom}/${wrappedX}/${tileY}.png`,
      });
    }
  }
  return tiles;
}

function pointOnScreen(point: [number, number], view: Viewport, size: MapSize) {
  const center = project(view.latitude, view.longitude, view.zoom);
  const projected = project(point[0], point[1], view.zoom);
  return {
    left: projected.x - center.x + size.width / 2,
    top: projected.y - center.y + size.height / 2,
  };
}

export function SchoolPilotageMap({ schools, selectedSchoolId, onSelectSchool, onLocationSaved, locationStorageReady }: {
  schools: PilotageMapSchool[];
  selectedSchoolId: string;
  onSelectSchool: (schoolId: string) => void;
  onLocationSaved: (schoolId: string, patch: LocationPatch) => void;
  locationStorageReady: boolean;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const viewRef = useRef<Viewport>({ latitude: GABON_CENTER[0], longitude: GABON_CENTER[1], zoom: 6 });
  const [view, setView] = useState<Viewport>(viewRef.current);
  const [mapSize, setMapSize] = useState<MapSize>({ width: 0, height: 0 });
  const [placing, setPlacing] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [tileWarning, setTileWarning] = useState(false);

  const selected = useMemo(() => schools.find((school) => school.id === selectedSchoolId) || null, [schools, selectedSchoolId]);
  const located = useMemo(() => schools
    .map((school) => ({ school, resolved: resolvePoint(school) }))
    .filter((item): item is { school: PilotageMapSchool; resolved: MapPoint } => Boolean(item.resolved)), [schools]);
  const exactCount = schools.filter((school) => finite(school.latitude) && finite(school.longitude)).length;
  const approxCount = located.length - exactCount;
  const missingCount = schools.length - located.length;
  const selectedResolved = selected ? resolvePoint(selected) : null;
  const exactSelected = Boolean(selected && finite(selected.latitude) && finite(selected.longitude));
  const mapReady = mapSize.width > 0 && mapSize.height > 0;
  const tiles = useMemo(() => tilesFor(view, mapSize), [mapSize, view]);

  function updateView(next: Viewport) {
    const normalized = {
      latitude: clampLatitude(next.latitude),
      longitude: normalizeLongitude(next.longitude),
      zoom: clamp(Math.round(next.zoom), MIN_ZOOM, MAX_ZOOM),
    };
    viewRef.current = normalized;
    setView(normalized);
  }

  useEffect(() => {
    const element = mapElementRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setMapSize({ width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!selected) {
      setLatitude(""); setLongitude(""); setMessage(""); setPlacing(false);
      return;
    }
    setLatitude(finite(selected.latitude) ? selected.latitude!.toFixed(6) : "");
    setLongitude(finite(selected.longitude) ? selected.longitude!.toFixed(6) : "");
    setMessage(""); setSuccess(false); setPlacing(false);
    const resolved = resolvePoint(selected);
    if (resolved) {
      const next = {
        latitude: resolved.point[0], longitude: resolved.point[1],
        zoom: resolved.precision === "exact" ? 15 : 12,
      };
      viewRef.current = next;
      setView(next);
    }
  }, [selected]);

  function changeZoom(delta: number) {
    updateView({ ...viewRef.current, zoom: viewRef.current.zoom + delta });
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    if (Math.abs(event.deltaY) >= 4) changeZoom(event.deltaY < 0 ? 1 : -1);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    const currentView = viewRef.current;
    const center = project(currentView.latitude, currentView.longitude, currentView.zoom);
    dragRef.current = {
      pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY,
      startWorldX: center.x, startWorldY: center.y, zoom: currentView.zoom, moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) drag.moved = true;
    if (!drag.moved) return;
    const next = unproject(drag.startWorldX - deltaX, drag.startWorldY - deltaY, drag.zoom);
    updateView({ ...next, zoom: drag.zoom });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!placing || drag.moved) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const currentView = viewRef.current;
    const center = project(currentView.latitude, currentView.longitude, currentView.zoom);
    const chosen = unproject(
      center.x + event.clientX - rect.left - rect.width / 2,
      center.y + event.clientY - rect.top - rect.height / 2,
      currentView.zoom,
    );
    setLatitude(chosen.latitude.toFixed(6)); setLongitude(chosen.longitude.toFixed(6));
    setPlacing(false); setMessage("Position choisie. Clique sur « Enregistrer la position » pour la confirmer."); setSuccess(false);
  }

  function cancelPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  async function saveLocation() {
    if (!selected || !locationStorageReady) return;
    const lat = numberFromInput(latitude); const lng = numberFromInput(longitude);
    if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
      setMessage("Indique une latitude et une longitude valides."); setSuccess(false); return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setMessage("Les coordonnées saisies sont hors limites."); setSuccess(false); return;
    }
    setSaving(true); setMessage("");
    const { data, error } = await createClient().rpc("set_school_location", {
      p_school_id: selected.id, p_latitude: lat, p_longitude: lng, p_source: "map",
    });
    setSaving(false);
    if (error) { setMessage(error.message); setSuccess(false); return; }
    const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
    onLocationSaved(selected.id, {
      latitude: Number(row?.latitude ?? lat), longitude: Number(row?.longitude ?? lng),
      locationSource: String(row?.location_source || "map"),
      locationUpdatedAt: String(row?.location_updated_at || new Date().toISOString()),
    });
    setMessage("Position exacte enregistrée dans le Centre de pilotage."); setSuccess(true);
  }

  async function clearLocation() {
    if (!selected || !locationStorageReady || !finite(selected.latitude)) return;
    setSaving(true); setMessage("");
    const { error } = await createClient().rpc("set_school_location", {
      p_school_id: selected.id, p_latitude: null, p_longitude: null, p_source: "manual",
    });
    setSaving(false);
    if (error) { setMessage(error.message); setSuccess(false); return; }
    onLocationSaved(selected.id, { latitude: null, longitude: null, locationSource: null, locationUpdatedAt: null });
    setLatitude(""); setLongitude("");
    setMessage("Position exacte supprimée. La carte revient au repère approximatif de la ville ou de la province."); setSuccess(true);
  }

  function useApproximatePoint() {
    if (!selected) return;
    const resolved = resolvePoint({ ...selected, latitude: null, longitude: null });
    if (!resolved) { setMessage("Aucun repère automatique n’est disponible pour cette ville ou cette province."); setSuccess(false); return; }
    setLatitude(resolved.point[0].toFixed(6)); setLongitude(resolved.point[1].toFixed(6));
    updateView({ latitude: resolved.point[0], longitude: resolved.point[1], zoom: 12 });
    setMessage("Repère approximatif chargé. Tu peux cliquer sur « Placer précisément sur la carte » puis sur le bâtiment avant d’enregistrer."); setSuccess(false);
  }

  const selectedStatusClass = selected?.status === "active" || selected?.status === "trial" ? styles.statusActive
    : selected?.status === "grace_period" ? styles.statusGrace
      : ["suspended", "expired", "cancelled"].includes(selected?.status || "") ? styles.statusDanger : "";

  return (
    <section className={styles.panel} aria-label="Carte nationale des établissements">
      <div className={styles.head}>
        <div className={styles.title}><span className={styles.titleIcon}><MapPin /></span><div>
          <h2>Carte nationale des établissements</h2>
          <p>Visualise le réseau Gabon Éduc+ sur le territoire. Les repères en pointillés sont approximatifs tant que la position GPS exacte n’a pas été enregistrée.</p>
        </div></div>
        <div className={styles.stats}>
          <span className={`${styles.stat} ${styles.exact}`}><i className={styles.statDot} />{exactCount} exact(s)</span>
          <span className={`${styles.stat} ${styles.approx}`}><i className={styles.statDot} />{approxCount} approximatif(s)</span>
          <span className={styles.stat}><i className={styles.statDot} />{missingCount} à localiser</span>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.mapShell}>
          <div ref={mapElementRef} className={`${styles.map} ${styles.nativeMap} ${placing ? styles.mapCrosshair : ""}`}
            onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer} role="application"
            aria-label="Carte interactive des établissements Gabon Éduc+">
            {tiles.map((tile) => <img key={tile.key} className={styles.mapTile} src={tile.url} alt="" draggable={false}
              style={{ left: tile.left, top: tile.top }} onLoad={() => setTileWarning(false)} onError={() => setTileWarning(true)} />)}
            {mapReady && located.map(({ school, resolved }) => {
              const screen = pointOnScreen(resolved.point, view, mapSize);
              if (screen.left < -40 || screen.top < -40 || screen.left > mapSize.width + 40 || screen.top > mapSize.height + 40) return null;
              const markerClasses = [styles.marker, resolved.precision !== "exact" ? styles.markerApprox : "", school.id === selectedSchoolId ? styles.markerSelected : ""].filter(Boolean).join(" ");
              return <button key={school.id} type="button" className={styles.nativeMarkerButton}
                style={{ left: screen.left, top: screen.top }} onClick={(event) => { event.stopPropagation(); onSelectSchool(school.id); }}
                title={`${school.name} — ${resolved.precision === "exact" ? "position exacte" : "position approximative"}`}
                aria-label={`${school.name}, ${statusLabel(school.status)}`}>
                <span className={markerClasses} style={{ background: statusColor(school.status) }} />
              </button>;
            })}
          </div>
          <div className={styles.zoomControls} aria-label="Contrôles de zoom">
            <button type="button" onClick={() => changeZoom(1)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoomer"><Plus /></button>
            <button type="button" onClick={() => changeZoom(-1)} disabled={view.zoom <= MIN_ZOOM} aria-label="Dézoomer"><Minus /></button>
          </div>
          {placing && <div className={styles.placeMode}>Clique sur la carte à l’emplacement exact de l’établissement</div>}
          {tileWarning && <div className={styles.tileWarning}>Le fond OpenStreetMap répond mal. Les repères et le positionnement restent utilisables.</div>}
          <div className={styles.attribution}>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></div>
          <div className={styles.legend}>
            <span><i className={styles.active} />Actif / essai</span><span><i className={styles.grace} />Délai</span>
            <span><i className={styles.suspended} />Suspendu / expiré</span><span><i className={styles.other} />Autre statut</span>
          </div>
        </div>

        <aside className={styles.side}>
          {!selected ? <div className={styles.emptySide}><MapPin /><p>Sélectionne un établissement sur la carte ou dans la liste.</p></div> : <>
            <div className={styles.schoolHead}><div><h3>{selected.name}</h3><p>{[selected.city, selected.province].filter(Boolean).join(", ") || "Localisation administrative non renseignée"}</p></div>
              <span className={`${styles.status} ${selectedStatusClass}`}>{statusLabel(selected.status)}</span></div>
            <div className={styles.locationState}><strong>{exactSelected ? <CheckCircle2 /> : <LocateFixed />}
              {exactSelected ? "Position GPS exacte" : selectedResolved ? "Repère approximatif disponible" : "Position à définir"}</strong><p>
              {exactSelected ? `Dernière mise à jour : ${selected.locationUpdatedAt ? new Date(selected.locationUpdatedAt).toLocaleString("fr-FR") : "date inconnue"}.`
                : selectedResolved ? "Le marqueur est actuellement placé à partir de la ville ou de la province. Définis sa position exacte pour fiabiliser la carte."
                  : "La ville ou la province ne permet pas de placer automatiquement cet établissement. Clique directement sur la carte."}</p></div>
            <div className={styles.coords}>
              <label>Latitude<input inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="Ex. 0.416200" /></label>
              <label>Longitude<input inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="Ex. 9.467300" /></label>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={useApproximatePoint}><LocateFixed />Partir du repère ville/province</button>
              <button type="button" className={styles.secondary} onClick={() => { setPlacing(true); setMessage(""); setSuccess(false); }} disabled={!mapReady}><Crosshair />Placer précisément sur la carte</button>
              <button type="button" className={styles.primary} onClick={() => void saveLocation()} disabled={!locationStorageReady || saving}><MapPin />{saving ? "Enregistrement…" : "Enregistrer la position"}</button>
              {exactSelected && <button type="button" className={styles.dangerButton} onClick={() => void clearLocation()} disabled={!locationStorageReady || saving}><Trash2 />Retirer la position exacte</button>}
            </div>
            {!locationStorageReady && <div className={styles.migration}>La carte fonctionne déjà en mode approximatif. Pour enregistrer les coordonnées exactes, applique la migration <b>109_school_geolocation.sql</b> à Supabase.</div>}
            {message && <div className={`${styles.message} ${success ? styles.success : ""}`}>{message}</div>}
            <p className={styles.tip}>Conseil : zoome sur le quartier, clique sur « Placer précisément sur la carte », puis clique sur le bâtiment de l’établissement. Aucune localisation d’élève, de parent ou d’enseignant n’est enregistrée.</p>
          </>}
        </aside>
      </div>
    </section>
  );
}
