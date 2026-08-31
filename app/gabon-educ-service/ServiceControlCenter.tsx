"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Banknote, Building2, CalendarClock, CheckCircle2, Clock3,
  Eye, GraduationCap, LayoutDashboard, RefreshCcw, Search, ShieldCheck,
  Users, XCircle
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SubscriptionStatus } from "@/lib/subscriptions/types";
import { SchoolPilotageMap, type PilotageMapSchool } from "./SchoolPilotageMap";

type School = {
  id: string; name: string; school_type: string | null; school_sector: string | null; province: string | null;
  city: string | null; phone: string | null; email: string | null; created_at: string;
  latitude?: number | null; longitude?: number | null; location_source?: string | null; location_updated_at?: string | null;
};
type Subscription = {
  id: string; school_id: string; plan_code: string; status: SubscriptionStatus;
  starts_at: string; expires_at: string; grace_period_ends_at: string | null;
  last_payment_at: string | null; schools: School | null;
};
type Payment = {
  id: string; school_id: string; amount: number; currency: string; payment_method: string | null;
  payment_reference: string | null; payment_status: string; paid_at: string | null; created_at: string;
};
type StatusLog = { id: string; school_id: string; previous_status: SubscriptionStatus | null; new_status: SubscriptionStatus; reason: string | null; changed_at: string };
type Usage = { students: number; teachers: number; classes: number };
type LocationPatch = { latitude: number | null; longitude: number | null; locationSource: string | null; locationUpdatedAt: string | null };

function schoolTypeLabel(value?: string | null) {
  return value === "primary" ? "Primaire" : "Secondaire";
}
const labels: Record<SubscriptionStatus, string> = {
  trial: "Essai", active: "Actif", grace_period: "Délai", suspended: "Suspendu",
  expired: "Expiré", cancelled: "Résilié",
};

function money(value: number) { return new Intl.NumberFormat("fr-FR").format(value) + " FCFA"; }
function date(value?: string | null) { return value ? new Date(value).toLocaleDateString("fr-FR") : "—"; }
function missingLocationSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const raw = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  const text = [raw.message, raw.details, raw.hint, raw.code].filter(Boolean).join(" ").toLowerCase();
  return /latitude|longitude|location_source|location_updated_at|schema cache|42703|pgrst/.test(text);
}

export function ServiceControlCenterPage() {
  const [rows, setRows] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [logs, setLogs] = useState<StatusLog[]>([]);
  const [usage, setUsage] = useState<Record<string, Usage>>({});
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Virement bancaire");
  const [paymentReference, setPaymentReference] = useState("");
  const [locationStorageReady, setLocationStorageReady] = useState(true);

  const load = useCallback(async (confirm = false) => {
    setLoading(true); setMessage("");
    const supabase = createClient();

    const [paymentsResult, logsResult] = await Promise.all([
      supabase.from("subscription_payments").select("id,school_id,amount,currency,payment_method,payment_reference,payment_status,paid_at,created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("subscription_status_logs").select("id,school_id,previous_status,new_status,reason,changed_at").order("changed_at", { ascending: false }).limit(200),
    ]);

    const locationSelect = "id,school_id,plan_code,status,starts_at,expires_at,grace_period_ends_at,last_payment_at,schools(id,name,school_type,school_sector,province,city,phone,email,created_at,latitude,longitude,location_source,location_updated_at)";
    const legacySelect = "id,school_id,plan_code,status,starts_at,expires_at,grace_period_ends_at,last_payment_at,schools(id,name,school_type,school_sector,province,city,phone,email,created_at)";
    const enriched = await supabase.from("school_subscriptions").select(locationSelect).order("expires_at");

    let subscriptionData: unknown[] = [];
    let subscriptionError: unknown = enriched.error;
    if (!enriched.error) {
      subscriptionData = (enriched.data || []) as unknown[];
      setLocationStorageReady(true);
    } else if (missingLocationSchema(enriched.error)) {
      const fallback = await supabase.from("school_subscriptions").select(legacySelect).order("expires_at");
      subscriptionData = (fallback.data || []) as unknown[];
      subscriptionError = fallback.error;
      setLocationStorageReady(false);
    }

    if (subscriptionError) {
      setMessage("Accès refusé : ce centre est réservé aux comptes autorisés de GABON EDUC+ SERVICE.");
      setRows([]); setLoading(false); return;
    }

    const nextRows = subscriptionData as unknown as Subscription[];
    setRows(nextRows);
    setPayments((paymentsResult.data || []) as unknown as Payment[]);
    setLogs((logsResult.data || []) as unknown as StatusLog[]);
    setSelectedId(current => nextRows.some(row => row.school_id === current) ? current : (nextRows[0]?.school_id || ""));

    const usageEntries = await Promise.all(nextRows.map(async row => {
      const [students, memberships, classes] = await Promise.all([
        supabase.from("student_records").select("id", { count: "exact", head: true }).eq("school_id", row.school_id),
        supabase.from("school_memberships").select("id", { count: "exact", head: true }).eq("school_id", row.school_id).eq("role", "teacher"),
        supabase.from("class_groups").select("id", { count: "exact", head: true }).eq("school_id", row.school_id),
      ]);
      return [row.school_id, { students: students.count || 0, teachers: memberships.count || 0, classes: classes.count || 0 }] as const;
    }));
    setUsage(Object.fromEntries(usageEntries));
    if (confirm) setMessage(`Centre actualisé à ${new Date().toLocaleTimeString("fr-FR")}.`);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    const currentMonth = new Date(); currentMonth.setDate(1); currentMonth.setHours(0,0,0,0);
    const revenue = payments.filter(p => p.payment_status === "confirmed" && new Date(p.paid_at || p.created_at) >= currentMonth).reduce((sum,p) => sum + Number(p.amount), 0);
    const sevenDays = new Date(Date.now() + 7 * 86400000);
    return {
      total: rows.length,
      active: rows.filter(r => r.status === "active" || r.status === "trial").length,
      grace: rows.filter(r => r.status === "grace_period").length,
      suspended: rows.filter(r => r.status === "suspended").length,
      expired: rows.filter(r => r.status === "expired" || r.status === "cancelled").length,
      dueSoon: rows.filter(r => new Date(r.expires_at) >= new Date() && new Date(r.expires_at) <= sevenDays).length,
      revenue,
    };
  }, [rows, payments]);

  const filtered = useMemo(() => rows.filter(row => {
    const haystack = `${row.schools?.name || ""} ${row.schools?.city || ""} ${row.schools?.province || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (statusFilter === "all" || row.status === statusFilter);
  }), [rows, query, statusFilter]);

  const mapSchools = useMemo<PilotageMapSchool[]>(() => rows.flatMap(row => row.schools ? [{
    id: row.school_id,
    name: row.schools.name || row.school_id,
    city: row.schools.city,
    province: row.schools.province,
    status: row.status,
    latitude: typeof row.schools.latitude === "number" ? row.schools.latitude : null,
    longitude: typeof row.schools.longitude === "number" ? row.schools.longitude : null,
    locationSource: row.schools.location_source || null,
    locationUpdatedAt: row.schools.location_updated_at || null,
  }] : []), [rows]);

  const selected = rows.find(row => row.school_id === selectedId) || null;
  const selectedPayments = payments.filter(p => p.school_id === selectedId);
  const selectedLogs = logs.filter(l => l.school_id === selectedId).slice(0, 8);

  function updateSchoolLocation(schoolId: string, patch: LocationPatch) {
    setRows(current => current.map(row => row.school_id === schoolId && row.schools ? {
      ...row,
      schools: {
        ...row.schools,
        latitude: patch.latitude,
        longitude: patch.longitude,
        location_source: patch.locationSource,
        location_updated_at: patch.locationUpdatedAt,
      },
    } : row));
  }

  async function changeStatus(row: Subscription, status: SubscriptionStatus) {
    const expires = new Date(); expires.setDate(expires.getDate() + (status === "active" ? 30 : 0));
    const grace = new Date(expires); grace.setDate(grace.getDate() + 7);
    const { error } = await createClient().rpc("set_school_subscription", {
      p_school_id: row.school_id, p_status: status, p_plan_code: row.plan_code,
      p_expires_at: expires.toISOString(),
      p_grace_period_ends_at: ["active", "grace_period"].includes(status) ? grace.toISOString() : null,
      p_reason: `Centre de pilotage : ${status}`,
    });
    setMessage(error ? error.message : `Statut de ${row.schools?.name || "l’établissement"} mis à jour.`);
    if (!error) await load();
  }

  async function registerPayment() {
    if (!selected || !paymentAmount || Number(paymentAmount) <= 0) { setMessage("Indique un montant valide."); return; }
    const { error } = await createClient().from("subscription_payments").insert({
      school_id: selected.school_id,
      subscription_id: selected.id,
      amount: Number(paymentAmount), currency: "XAF", payment_method: paymentMethod,
      payment_reference: paymentReference || null, payment_status: "confirmed", paid_at: new Date().toISOString(),
    });
    if (error) { setMessage(error.message); return; }
    setPaymentAmount(""); setPaymentReference(""); setMessage("Paiement enregistré."); await load();
  }

  return <main className="ges-control-center">
    <header className="ges-header">
      <div><span className="ges-brand-mark"><ShieldCheck /></span><div><p>GABON EDUC+ SERVICE</p><h1>Centre de pilotage</h1><small>Chaque établissement suivi est une école qui fonctionne mieux.</small></div></div>
      <nav><Link href="/gabon-educ">Ouvrir Gabon Educ+</Link><button onClick={() => void load(true)} disabled={loading}><RefreshCcw className={loading ? "spin" : ""}/>{loading ? "Actualisation…" : "Actualiser"}</button></nav>
    </header>

    {message && <div className="ges-message">{message}</div>}

    <section className="ges-kpis">
      <article><Building2/><div><span>Établissements</span><strong>{summary.total}</strong></div></article>
      <article className="ok"><CheckCircle2/><div><span>Actifs / essai</span><strong>{summary.active}</strong></div></article>
      <article className="warn"><Clock3/><div><span>En délai</span><strong>{summary.grace}</strong></div></article>
      <article className="danger"><XCircle/><div><span>Suspendus</span><strong>{summary.suspended}</strong></div></article>
      <article><CalendarClock/><div><span>Échéances à 7 jours</span><strong>{summary.dueSoon}</strong></div></article>
      <article className="money"><Banknote/><div><span>Revenus du mois</span><strong>{money(summary.revenue)}</strong></div></article>
    </section>

    <SchoolPilotageMap
      schools={mapSchools}
      selectedSchoolId={selectedId}
      onSelectSchool={setSelectedId}
      onLocationSaved={updateSchoolLocation}
      locationStorageReady={locationStorageReady}
    />

    <section className="ges-main-grid">
      <div className="ges-panel ges-schools-panel">
        <div className="ges-panel-title"><div><LayoutDashboard/><h2>Établissements clients</h2></div><span>{filtered.length} résultat(s)</span></div>
        <div className="ges-filters"><label><Search/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un établissement ou une ville"/></label><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">Tous les statuts</option>{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="ges-table"><div className="ges-table-head"><span>Établissement</span><span>Ville</span><span>Formule</span><span>Échéance</span><span>Statut</span><span></span></div>{filtered.map(row => <button className={selectedId === row.school_id ? "selected" : ""} key={row.school_id} onClick={() => setSelectedId(row.school_id)}><span><b>{row.schools?.name || row.school_id}</b><small>{schoolTypeLabel(row.schools?.school_type)}</small></span><span>{row.schools?.city || "—"}</span><span>{row.plan_code}</span><span>{date(row.expires_at)}</span><span><i className={`ges-status ${row.status}`}>{labels[row.status]}</i></span><span><Eye/></span></button>)}</div>
      </div>

      <aside className="ges-panel ges-alerts">
        <div className="ges-panel-title"><div><AlertTriangle/><h2>Priorités</h2></div></div>
        {rows.filter(r => r.status === "suspended" || r.status === "expired" || new Date(r.expires_at) <= new Date(Date.now()+7*86400000)).slice(0,6).map(r => <button key={r.school_id} onClick={() => setSelectedId(r.school_id)}><i className={`ges-dot ${r.status}`}></i><span><b>{r.schools?.name}</b><small>{r.status === "suspended" ? "Abonnement suspendu" : `Échéance : ${date(r.expires_at)}`}</small></span></button>)}
        {!rows.length && !loading && <p>Aucun établissement enregistré.</p>}
        {!!rows.length && !rows.some(r => r.status === "suspended" || r.status === "expired" || new Date(r.expires_at) <= new Date(Date.now()+7*86400000)) && <p className="ges-all-good">Aucune alerte prioritaire.</p>}
      </aside>
    </section>

    {selected && <section className="ges-panel ges-school-detail">
      <div className="ges-detail-head"><div><span className="ges-school-icon"><GraduationCap/></span><div><p>Fiche établissement</p><h2>{selected.schools?.name}</h2><small>{[selected.schools?.city, selected.schools?.province].filter(Boolean).join(", ") || "Localisation non renseignée"}</small></div></div><i className={`ges-status ${selected.status}`}>{labels[selected.status]}</i></div>
      <div className="ges-detail-grid">
        <article><h3>Identité et activité</h3><dl><div><dt>Téléphone</dt><dd>{selected.schools?.phone || "—"}</dd></div><div><dt>E-mail</dt><dd>{selected.schools?.email || "—"}</dd></div><div><dt>Client depuis</dt><dd>{date(selected.schools?.created_at)}</dd></div><div><dt>Position GPS</dt><dd>{typeof selected.schools?.latitude === "number" && typeof selected.schools?.longitude === "number" ? `${selected.schools.latitude.toFixed(5)}, ${selected.schools.longitude.toFixed(5)}` : "À préciser sur la carte"}</dd></div></dl><div className="ges-usage"><span><Users/><b>{usage[selected.school_id]?.students || 0}</b><small>Élèves</small></span><span><Users/><b>{usage[selected.school_id]?.teachers || 0}</b><small>Enseignants</small></span><span><Building2/><b>{usage[selected.school_id]?.classes || 0}</b><small>Classes</small></span></div></article>
        <article><h3>Abonnement</h3><dl><div><dt>Formule</dt><dd>{selected.plan_code}</dd></div><div><dt>Début</dt><dd>{date(selected.starts_at)}</dd></div><div><dt>Échéance</dt><dd>{date(selected.expires_at)}</dd></div><div><dt>Fin du délai</dt><dd>{date(selected.grace_period_ends_at)}</dd></div></dl><div className="ges-actions"><button onClick={() => void changeStatus(selected,"active")}>Activer 30 jours</button><button onClick={() => void changeStatus(selected,"grace_period")}>Accorder un délai</button><button className="danger" onClick={() => void changeStatus(selected,"suspended")}>Suspendre</button></div></article>
        <article><h3>Enregistrer un paiement</h3><label>Montant (FCFA)<input type="number" min="0" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="Ex. 150000"/></label><label>Moyen de paiement<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option>Virement bancaire</option><option>Airtel Money</option><option>Moov Money</option><option>Chèque</option><option>Espèces</option></select></label><label>Référence<input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="Référence facultative"/></label><button className="primary" onClick={() => void registerPayment()}>Confirmer le paiement</button></article>
      </div>
      <div className="ges-history-grid"><article><h3>Derniers paiements</h3>{selectedPayments.slice(0,6).map(p => <div className="ges-history-row" key={p.id}><span><b>{money(Number(p.amount))}</b><small>{p.payment_method || "Moyen non indiqué"}</small></span><span>{date(p.paid_at || p.created_at)}</span></div>)}{!selectedPayments.length && <p>Aucun paiement enregistré.</p>}</article><article><h3>Historique des statuts</h3>{selectedLogs.map(log => <div className="ges-history-row" key={log.id}><span><b>{labels[log.new_status]}</b><small>{log.reason || "Modification du statut"}</small></span><span>{date(log.changed_at)}</span></div>)}{!selectedLogs.length && <p>Aucun changement enregistré.</p>}</article></div>
    </section>}
  </main>;
}
