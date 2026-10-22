"use client";

/* Holds the saved prospects for the whole app and is the only place that
   talks to lib/storage.js. Pages read and change prospects through useProspects().
   Signed in: prospects come from Supabase. Sign-in not set up: from this browser. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadProspects, saveProspect, deleteProspect, loadOrganizations, resetWorkspace } from "@/lib/storage";
import { fetchStatus } from "@/lib/api";
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
  const [server, setServer] = useState({ ai: false, jobs: false });
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
    fetchStatus().then((s) => setServer({ ai: !!s.ai, jobs: !!s.jobs })).catch(() => {});
    return () => clearTimeout(timer.current);
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
        }
      })
      .catch(() => {
        if (!alive) return;
        toast("Couldn't load your prospects from the database. Check that supabase/schema.sql has been run.");
        apply({ mode: "memory", prospects: [] });
      });
    return () => { alive = false; };
  }, [status, userId, toast, reloadKey]);

  const save = useCallback((p) => {
    const next = { ...p, updatedAt: Date.now() };
    ref.current = { ...ref.current, [next.id]: next };
    setProspects(ref.current);
    saveProspect(next).catch(() => toast("Couldn't save that change. Check your connection and try again."));
    return next;
  }, [toast]);

  const remove = useCallback((id) => {
    const { [id]: _gone, ...rest } = ref.current;
    ref.current = rest;
    setProspects(rest);
    deleteProspect(id).catch(() => toast("Couldn't remove that prospect. Check your connection and try again."));
  }, [toast]);

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

  const value = useMemo(() => ({
    prospects,
    list: Object.values(prospects),
    mode,
    catalog,
    server,
    aiOn: !aiOff && server.ai,
    setAiOff,
    save,
    remove,
    clearAll,
    get,
    loadExamples,
    resetSample,
    toast,
  }), [prospects, mode, catalog, server, aiOff, save, remove, clearAll, get, loadExamples, resetSample, toast]);

  return (
    <ProspectsContext.Provider value={value}>
      {children}
      <div className="toast" role="status" hidden={!toastMsg}>{toastMsg}</div>
    </ProspectsContext.Provider>
  );
}
