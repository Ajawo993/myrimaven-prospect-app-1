/* Where prospects are saved.

   Signed in with Supabase set up: in your Supabase tables (see supabase/schema.sql),
   so data follows your account to any device and stays private to you.
   Otherwise: this browser's localStorage, as before.

   Every component saves through ProspectsProvider, which only calls the functions here. */

import { supabase } from "./supabase";

const KEY = "myrimaven-prospects-v1"; // same key as earlier versions, so browser data carries over
const DISMISS_KEY = "myrimaven-copy-dismissed";
let mode = "local"; // "local" | "memory" | "cloud"
let cache = {};
let available = false;

/* ---------- this browser ---------- */

function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.setItem(KEY + "-test", "1");
    localStorage.removeItem(KEY + "-test");
    cache = raw ? JSON.parse(raw) : {};
    available = true;
    mode = "local";
    return { mode: "local", prospects: Object.values(cache) };
  } catch {
    cache = {};
    available = false;
    mode = "memory";
    return { mode: "memory", prospects: [] };
  }
}

function flush() {
  if (!available) return;
  localStorage.setItem(KEY, JSON.stringify(cache)); // throws if storage is full
}

/* Prospects saved in this browser by the earlier, sign-in-free version */
export function browserProspects() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? Object.values(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function copyDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}

export function dismissCopy() {
  try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
}

/* ---------- Supabase ---------- */

const byPosition = (a, b) => (a.position || 0) - (b.position || 0);

/* A prospects row with its child rows (from one select) -> the object the app uses */
export function rowToProspect(r) {
  const a = r.assessment || {};
  return {
    id: r.id,
    name: r.name,
    sector: r.sector || "",
    size: r.size || "",
    region: r.region || "",
    website: r.website || "",
    summary: r.summary || "",
    signals: r.signals || [],
    catalogKey: r.organization_key || "",
    example: !!r.is_example,
    fit: r.fit || {},
    fitWhy: r.fit_why || {},
    jobs: r.jobs || null,
    analysis: {
      problems: a.problems || [],
      roles: a.roles || [],
      fitConcerns: a.fitConcerns || [],
      generatedBy: a.generatedBy || "none",
      generatedAt: a.generatedAt || "",
      evidence: (r.evidence || []).slice().sort(byPosition).map((e) => ({
        text: e.text, source: e.source || "", checked: !!e.checked, ...(e.added_by_user ? { mine: true } : {}),
      })),
      unknowns: (r.unknowns || []).slice().sort(byPosition).map((u) => ({
        text: u.text, done: !!u.answered, ...(u.added_by_user ? { mine: true } : {}),
      })),
    },
    contacts: (r.contacts || []).slice().sort(byPosition).map((c) => ({
      id: c.id, name: c.name, role: c.role || "", email: c.email || "", phone: c.phone || "",
      authority: c.authority, connection: c.connection, notes: c.notes || "",
    })),
    outreach: (r.outreach || []).map((o) => ({
      id: o.id, date: o.date, contactId: o.contact_id || "", connection: o.connection, channel: o.channel || "",
      outcome: o.outcome, reason: o.reason || "", learned: o.learned || "",
    })),
    status: r.status,
    fitNote: r.fit_note || "",
    nextAction: r.next_action || "",
    followUpDate: r.follow_up_date || "",
    notes: r.notes || "",
    createdAt: Date.parse(r.created_at) || Date.now(),
    updatedAt: Date.parse(r.updated_at) || Date.now(),
  };
}

/* An organizations row -> the shape Discover uses */
export function rowToOrganization(r) {
  return {
    key: r.key, name: r.name, sector: r.sector, size: r.size, region: r.region, summary: r.summary,
    hiring: r.hiring, signals: r.signals || [], fit: r.fit_code, outside: !!r.outside_focus, analysis: r.assessment || {},
  };
}

/* Saves are queued per prospect and briefly delayed, so typing in a field sends one save, not one per key */
const pending = new Map();
const running = new Map();
const SAVE_DELAY_MS = 500;

function queueCloudSave(p) {
  pending.set(p.id, p);
  if (running.has(p.id)) return running.get(p.id);
  const run = (async () => {
    try {
      while (pending.has(p.id)) {
        await new Promise((r) => setTimeout(r, SAVE_DELAY_MS));
        const next = pending.get(p.id);
        pending.delete(p.id);
        if (!next) break;
        const { error } = await supabase.rpc("save_prospect", { p: next });
        if (error) throw error;
      }
    } finally {
      running.delete(p.id);
    }
  })();
  running.set(p.id, run);
  return run;
}

export async function loadOrganizations() {
  if (mode !== "cloud" || !supabase) return null;
  const { data, error } = await supabase.from("organizations").select("*").order("name");
  if (error || !data || !data.length) return null;
  return data.map(rowToOrganization);
}

/* Wipe this account's prospects and reload the starter workspace (supabase/sample_data.sql) */
export async function resetWorkspace() {
  if (mode !== "cloud" || !supabase) throw new Error("Only available when signed in");
  for (const [, run] of running) await run.catch(() => {});
  pending.clear();
  const { data, error } = await supabase.rpc("reset_my_workspace");
  if (error) throw error;
  return data;
}

/* Add the sample prospects to this account and keep the user's own (supabase/sample_data.sql) */
export async function loadSampleData() {
  if (mode !== "cloud" || !supabase) throw new Error("Only available when signed in");
  for (const [, run] of running) await run.catch(() => {});
  pending.clear();
  const { data, error } = await supabase.rpc("load_sample_data");
  if (error) throw error;
  return data;
}

/* ---------- what the app calls ---------- */

/* -> { mode: "cloud" | "local" | "memory", prospects } */
export async function loadProspects({ cloud = false } = {}) {
  if (cloud && supabase) {
    const { data, error } = await supabase
      .from("prospects")
      .select("*, contacts(*), outreach(*), evidence(*), unknowns(*)")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    mode = "cloud";
    return { mode: "cloud", prospects: (data || []).map(rowToProspect) };
  }
  return loadLocal();
}

export async function saveProspect(prospect) {
  if (mode === "cloud") return queueCloudSave(prospect);
  cache[prospect.id] = prospect;
  flush();
}

export async function deleteProspect(id) {
  if (mode === "cloud") {
    pending.delete(id);
    if (running.has(id)) await running.get(id).catch(() => {});
    const { error } = await supabase.from("prospects").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  delete cache[id];
  flush();
}
