"use client";

/* Holds the saved prospects for the whole app and is the only place that
   talks to lib/storage.js. Pages read and change prospects through useProspects().
   Signed in: prospects come from Supabase. Sign-in not set up: from this browser. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadProspects, saveProspect, deleteProspect, loadOrganizations, loadLastDiscovery, resetWorkspace, loadSampleData, removeSampleData } from "@/lib/storage";
import { fetchStatus, getUpdates, calendarSync } from "@/lib/api";
import { buildExamples, upgrade } from "@/lib/prospect";
import { CATALOG } from "@/lib/catalog";
import { useAuth } from "./AuthProvider";

const ProspectsContext = createContext(null);

export function useProspects() {
  return useContext(ProspectsContext);
}

export default function ProspectsProvider({ children }) {
  const { status, user } = useAuth();
  const userId = user ? user.id : null;
  const [prospects, setProspects] = useState({});
  const ref = useRef({});
  const [mode, setMode] = useState("loading"); // loading | cloud | local | memory
  const [catalog, setCatalog] = useState(CATALOG);
  const [discovery, setDiscovery] = useState(null); // latest weekly agent run
  const [server, setServer] = useState({ ai: false, jobs: false, web: false, email: false, calendar: false });
  const [calendarOn, setCalendarOn] = useState(false);
  const calTimer = useRef(null);
  const [aiOff, setAiOff] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const timer = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(""), 4200);
  }, []);

  useEffect(() => {
    fetchStatus().then((s) => setServer({ ai: !!s.ai, jobs: !!s.jobs, web: !!s.web, email: !!s.email, calendar: !!s.calendar })).catch(() => {});
    return () => { clearTimeout(timer.current); clearTimeout(calTimer.current); };
  }, []);

  /* Load (again) whenever who's signed in changes */
  useEffect(() => {
    if (status === "loading") return;
    let alive = true;
    const apply = ({ mode: m, prospects: list }) => {
      if (!alive) return;
      const map = {};
      list.forEach((p) => { map[p.id] = upgrade(p); });
      ref.current = map;
      setProspects(map);
      setMode(m);
    };
    if (status === "signedOut") {
      apply({ mode: "loading", prospects: [] });
      return () => { alive = false; };
    }
    const cloud = status === "signedIn";
    setMode("loading");
    loadProspects({ cloud })
      .then((res) => {
        apply(res);
        if (res.mode === "cloud") {
          loadOrganizations().then((orgs) => { if (alive && orgs) setCatalog(orgs); }).catch(() => {});
          loadLastDiscovery().then((r) => { if (alive) setDiscovery(r); }).catch(() => {});
        }
      })
      .catch(() => {
        if (!alive) return;
        toast("Couldn't load your prospects from the database. Check that supabase/schema.sql has been run.");
        apply({ mode: "memory", prospects: [] });
      });
    return () => { alive = false; };
  }, [status, userId, toast, reloadKey]);

  /* Is Google Calendar connected? Checked once after sign-in, so date changes can be synced */
  useEffect(() => {
    if (status !== "signedIn" || !server.calendar) { setCalendarOn(false); return; }
    getUpdates().then((r) => setCalendarOn(!!(r.settings && r.settings.calendar.connected))).catch(() => {});
  }, [status, userId, server.calendar]);

  /* A few seconds after the last change to a follow-up, bring the calendar up to date (one call for many edits) */
  const syncSoon = useCallback(() => {
    clearTimeout(calTimer.current);
    calTimer.current = setTimeout(() => {
      calendarSync().catch((e) => {
        if (e && e.code === "calendar_expired") { setCalendarOn(false); toast("Google Calendar access expired. Reconnect it in Updates & calendar."); }
      });
    }, 4000);
  }, [toast]);

  const save = useCallback((p) => {
    const prev = ref.current[p.id];
    const next = { ...p, updatedAt: Date.now() };
    ref.current = { ...ref.current, [next.id]: next };
    setProspects(ref.current);
    const onCalendar = (x) => x ? [x.followUpDate, x.name, x.nextAction, x.status].join("|") : "";
    const calChanged = calendarOn && mode === "cloud" && (next.followUpDate || (prev && prev.followUpDate)) && onCalendar(prev) !== onCalendar(next);
    saveProspect(next)
      .then(() => { if (calChanged) syncSoon(); })
      .catch(() => toast("Couldn't save that change. Check your connection and try again."));
    return next;
  }, [toast, calendarOn, mode, syncSoon]);

  const remove = useCallback((id) => {
    const { [id]: gone, ...rest } = ref.current;
    ref.current = rest;
    setProspects(rest);
    deleteProspect(id)
      .then(() => { if (calendarOn && mode === "cloud" && gone && gone.followUpDate) syncSoon(); })
      .catch(() => toast("Couldn't remove that prospect. Check your connection and try again."));
  }, [toast, calendarOn, mode, syncSoon]);

  const clearAll = useCallback(() => {
    Object.keys(ref.current).forEach((id) => deleteProspect(id).catch(() => {}));
    ref.current = {};
    setProspects({});
  }, []);

  /* Latest copy of a prospect, for work that finishes after a wait (AI, job postings) */
  const get = useCallback((id) => ref.current[id], []);

  const loadExamples = useCallback(() => {
    const existing = Object.values(ref.current);
    buildExamples().forEach((p) => {
      const dup = existing.some((x) => x.catalogKey === p.catalogKey || x.name.toLowerCase() === p.name.toLowerCase());
      if (!dup) save(p);
    });
    toast("Added three worked examples. They're marked Example.");
  }, [save, toast]);

  /* Signed in: replace this account's data with a fresh copy of the sample workspace */
  const resetSample = useCallback(async () => {
    try {
      const n = await resetWorkspace();
      setReloadKey((k) => k + 1);
      toast(`Sample data reloaded: ${n} prospects.`);
    } catch {
      toast("Couldn't reset the sample data. Check that supabase/sample_data.sql has been run.");
    }
  }, [toast]);

  /* Signed in: add the sample prospects without touching the user's own */
  const addSample = useCallback(async () => {
    try {
      const n = await loadSampleData();
      setReloadKey((k) => k + 1);
      toast(`Loaded ${n} sample prospects. Your own prospects are unchanged.`);
    } catch {
      toast("Couldn't load the sample prospects. Check that supabase/sample_data.sql has been run.");
    }
  }, [toast]);

  /* Start fresh: take the sample prospects away and keep the user's own */
  const removeSample = useCallback(async () => {
    if (mode !== "cloud") {
      Object.values(ref.current).filter((p) => p.example).forEach((p) => remove(p.id));
      toast("Examples removed. You're starting fresh.");
      return;
    }
    try {
      const n = await removeSampleData();
      setReloadKey((k) => k + 1);
      const own = Object.keys(ref.current).filter((id) => !id.startsWith("sp-")).length;
      toast(own ? `Removed ${n} sample prospects. The ${own} you added are still here.` : `Removed ${n} sample prospects. You're starting fresh.`);
    } catch {
      toast("Couldn't remove the sample prospects. Check your connection and try again.");
    }
  }, [mode, remove, toast]);

  const value = useMemo(() => ({
    prospects,
    list: Object.values(prospects),
    mode,
    catalog,
    discovery,
    server,
    aiOn: !aiOff && server.ai,
    calendarOn,
    setCalendarOn,
    setAiOff,
    save,
    remove,
    clearAll,
    get,
    loadExamples,
    resetSample,
    addSample,
    removeSample,
    toast,
  }), [prospects, mode, catalog, discovery, server, aiOff, calendarOn, save, remove, clearAll, get, loadExamples, resetSample, addSample, removeSample, toast]);

  return (
    <ProspectsContext.Provider value={value}>
      {children}
      <div className="toast" role="status" hidden={!toastMsg}>{toastMsg}</div>
    </ProspectsContext.Provider>
  );
}
