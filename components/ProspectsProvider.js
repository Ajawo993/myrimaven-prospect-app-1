"use client";

/* Holds the saved prospects for the whole app and is the only place that
   talks to lib/storage.js. Pages read and change prospects through useProspects(). */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadProspects, saveProspect, deleteProspect } from "@/lib/storage";
import { fetchStatus } from "@/lib/api";
import { buildExamples, upgrade } from "@/lib/prospect";

const ProspectsContext = createContext(null);

export function useProspects() {
  return useContext(ProspectsContext);
}

export default function ProspectsProvider({ children }) {
  const [prospects, setProspects] = useState({});
  const ref = useRef({});
  const [mode, setMode] = useState("loading"); // loading | local | memory
  const [server, setServer] = useState({ ai: false, jobs: false });
  const [aiOff, setAiOff] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const timer = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(""), 4200);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchStatus()
      .then((s) => { if (alive) setServer({ ai: !!s.ai, jobs: !!s.jobs }); })
      .catch(() => {});
    loadProspects().then(({ mode: m, prospects: list }) => {
      if (!alive) return;
      const map = {};
      list.forEach((p) => { map[p.id] = upgrade(p); });
      ref.current = map;
      setProspects(map);
      setMode(m);
    });
    return () => { alive = false; clearTimeout(timer.current); };
  }, []);

  const save = useCallback((p) => {
    const next = { ...p, updatedAt: Date.now() };
    ref.current = { ...ref.current, [next.id]: next };
    setProspects(ref.current);
    saveProspect(next).catch(() => toast("Couldn't save in this browser. Changes last until you close the page."));
    return next;
  }, [toast]);

  const remove = useCallback((id) => {
    const { [id]: _gone, ...rest } = ref.current;
    ref.current = rest;
    setProspects(rest);
    deleteProspect(id).catch(() => toast("Couldn't update browser storage."));
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

  const value = useMemo(() => ({
    prospects,
    list: Object.values(prospects),
    mode,
    server,
    aiOn: !aiOff && server.ai,
    setAiOff,
    save,
    remove,
    clearAll,
    get,
    loadExamples,
    toast,
  }), [prospects, mode, server, aiOff, save, remove, clearAll, get, loadExamples, toast]);

  return (
    <ProspectsContext.Provider value={value}>
      {children}
      <div className="toast" role="status" hidden={!toastMsg}>{toastMsg}</div>
    </ProspectsContext.Provider>
  );
}
