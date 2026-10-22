"use client";

/* /discover — Workflow 1: find and investigate a prospect */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProspects } from "./ProspectsProvider";
import { FitPill, HowRate } from "./Fit";
import PreviewSheet from "./PreviewSheet";
import { SIGNALS } from "@/lib/constants";
import { CRIT, RANK, decodeFit, fitOf } from "@/lib/fit";
import { newProspect, jobsText, jobsEvidence, guessSignals } from "@/lib/prospect";
import { aiAnalysis, aiSuggest, fetchJobs, aiErr } from "@/lib/api";

const RATINGS = [["all", "All fits"], ["Strong", "Strong fit"], ["Moderate", "Moderate fit"], ["Weak", "Weak fit"]];

/* The open preview is mirrored in the address bar (?org=<key>), so the browser's
   Back button closes it and returns to the list instead of leaving Discover. */
const orgInUrl = () => new URLSearchParams(window.location.search).get("org");

export default function DiscoverView() {
  const router = useRouter();
  const { list, catalog, server, aiOn, setAiOff, save, toast } = useProspects();

  const [q, setQ] = useState("");
  const [signal, setSignal] = useState("all");
  const [rating, setRating] = useState("all");
  const [showOutside, setShowOutside] = useState(false);
  const [form, setForm] = useState({ sq: "", sr: "", an: "", aw: "", ar: "", ax: "" });
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [preview, setPreview] = useState(null);
  const [sug, setSug] = useState({ busy: false, err: "", items: [] });
  const [ana, setAna] = useState({ busy: false, err: "", step: "" });
  const sugCtl = useRef(null);
  const anaCtl = useRef(null);

  const findSaved = (org) => list.find((p) =>
    (org.key && p.catalogKey === org.key) || p.name.trim().toLowerCase() === org.name.trim().toLowerCase());

  const pushed = useRef(false);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const fromCatalog = (key) => {
    const c = catalogRef.current.find((x) => x.key === key);
    return c ? { org: c, analysis: c.analysis, by: "sample" } : null;
  };

  function openPreview(p) {
    setPreview(p);
    const url = `${window.location.pathname}?org=${encodeURIComponent(p.org.key || "new")}`;
    if (orgInUrl()) {
      window.history.replaceState(null, "", url);
    } else {
      window.history.pushState(null, "", url);
      pushed.current = true;
    }
  }

  function closePreview() {
    setPreview(null);
    if (!orgInUrl()) return;
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  /* Leaving Discover from the preview: drop ?org so Back lands on the list */
  function clearPreviewUrl() {
    pushed.current = false;
    if (orgInUrl()) window.history.replaceState(null, "", window.location.pathname);
  }

  useEffect(() => {
    const onPop = () => {
      const key = orgInUrl();
      if (!key) { pushed.current = false; setPreview(null); return; }
      const p = fromCatalog(key);
      if (p) setPreview(p);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* A link straight to /discover?org=<key> opens that organization */
  useEffect(() => {
    const key = orgInUrl();
    if (!key) return;
    const p = fromCatalog(key);
    if (p) setPreview((cur) => cur || p);
    else if (key === "new") window.history.replaceState(null, "", window.location.pathname);
  }, [catalog]);

  const cards = useMemo(() => {
    const term = q.trim().toLowerCase();
    return catalog
      .map((c) => ({ c, f: fitOf({ fit: decodeFit(c.fit), contacts: [] }) }))
      .filter(({ c, f }) =>
        (showOutside || !c.outside) &&
        (signal === "all" || c.signals.includes(signal)) &&
        (rating === "all" || f.rating === rating) &&
        (!term || [c.name, c.sector, c.region, c.summary].join(" ").toLowerCase().includes(term)))
      .sort((a, b) => RANK[a.f.rating] - RANK[b.f.rating] || b.f.yes.length - a.f.yes.length || a.f.no.length - b.f.no.length);
  }, [catalog, q, signal, rating, showOutside]);

  const outsideCount = catalog.filter((c) => c.outside).length;

  async function runSuggest() {
    if (!aiOn) return;
    if (sugCtl.current) sugCtl.current.abort();
    const ctl = new AbortController();
    sugCtl.current = ctl;
    setSug({ busy: true, err: "", items: [] });
    try {
      const items = await aiSuggest(form.sq, form.sr, ctl.signal);
      setSug({ busy: false, err: items.length ? "" : "No suggestions came back. Try describing the organizations differently.", items });
    } catch (e) {
      const [msg, off] = aiErr(e);
      if (off) setAiOff(true);
      setSug({ busy: false, err: msg, items: [] });
    }
  }

  async function runAnalyze(name, website, notes, signals, region) {
    if (!aiOn) return;
    if (anaCtl.current) anaCtl.current.abort();
    const ctl = new AbortController();
    anaCtl.current = ctl;
    setAna({ busy: true, err: "", step: "" });
    let jobs = null;
    try {
      if (server.jobs) {
        setAna({ busy: true, err: "", step: "Checking job postings" });
        try { jobs = await fetchJobs(name, region); } catch { jobs = null; }
        if (ctl.signal.aborted) throw { code: "cancelled" };
      }
      setAna({ busy: true, err: "", step: "Analyzing" });
      const a = await aiAnalysis(name, website, [notes, jobsText(jobs)].filter(Boolean).join("\n\n"), ctl.signal);
      if (jobs) a.evidence = [jobsEvidence(jobs), ...(a.evidence || [])];
      openPreview({
        org: { name, website, region, sector: a.sector, size: a.size, summary: a.summary, signals: signals || guessSignals(a), jobs },
        analysis: a,
        by: "ai",
      });
      setAna({ busy: false, err: "", step: "" });
    } catch (e) {
      const [msg, off] = aiErr(e);
      if (off) setAiOff(true);
      setAna({ busy: false, err: msg, step: "" });
    }
  }

  function onAnalyze() {
    const name = form.an.trim();
    if (!name) { setAna({ busy: false, err: "Enter an organization name first.", step: "" }); return; }
    runAnalyze(name, form.aw, form.ax, null, form.ar);
  }

  function onAnalyzeSuggestion(x) {
    const region = x.region || form.sr || "";
    const notes = `Suggested because: ${x.rationale}\nHow to check: ${x.verify}\nSector: ${x.sector}. Region: ${x.region}.`;
    setForm((f) => ({ ...f, an: x.name, aw: "", ar: region, ax: notes }));
    runAnalyze(x.name, "", notes, x.signals, region);
  }

  function onSaveManual() {
    const name = form.an.trim();
    if (!name) { setAna({ busy: false, err: "Enter an organization name first.", step: "" }); return; }
    const existing = findSaved({ name });
    if (existing) { router.push(`/prospects/${existing.id}`); return; }
    const np = newProspect({ name, website: form.aw, region: form.ar }, null, "none");
    if (form.ax) np.notes = form.ax;
    save(np);
    setForm((f) => ({ ...f, an: "", aw: "", ar: "", ax: "" }));
    router.push(`/prospects/${np.id}`);
  }

  function onSavePreview() {
    const np = newProspect(preview.org, preview.analysis, preview.by);
    save(np);
    setPreview(null);
    clearPreviewUrl();
    router.push(`/prospects/${np.id}`);
    toast("Saved. Check the evidence and fit, add a contact, then set a status.");
  }

  const savedPreview = preview ? findSaved(preview.org) : null;

  return (
    <>
      <section>
        <p className="eyebrow">Discover</p>
        <h1>Find organizations with a career alignment problem</h1>
      </section>

      <div className="discover">
        <div className="filters">
          <div className="filterbar">
            <label className="f grow">Search
              <input type="search" id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, sector or region" />
            </label>
            <label className="f">Fit
              <select id="rating" value={rating} onChange={(e) => setRating(e.target.value)}>
                {RATINGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="f">Signal
              <select id="signal" value={signal} onChange={(e) => setSignal(e.target.value)}>
                {[["all", "All signals"], ...Object.entries(SIGNALS)].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="f">Focus
              <select id="showOutside" value={showOutside ? "all" : "focus"} onChange={(e) => setShowOutside(e.target.value === "all")}>
                <option value="focus">Current focus</option>
                <option value="all">Include outside focus ({outsideCount})</option>
              </select>
            </label>
          </div>
          <div className="resultline">
            <span className="note">{cards.length} organization{cards.length === 1 ? "" : "s"}, best fit first</span>
            <HowRate />
          </div>

          <div className="cards">
            {cards.length ? cards.map(({ c, f }) => (
              <article key={c.key} className="org">
                <div>
                  <div className="org-top">
                    <h3>{c.name}</h3>
                    {findSaved(c) ? <span className="saved">Saved</span> : null}
                  </div>
                  <p className="sub">{[c.sector, c.region].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="fitline">
                  <FitPill f={f} />
                  <span>{f.yes.length} of {CRIT.length} criteria</span>
                  {c.outside ? <span className="tag out">Outside focus</span> : null}
                </div>
                <p className="sum">{c.summary}</p>
                <div className="foot">
                  <button className="btn small" onClick={() => openPreview({ org: c, analysis: c.analysis, by: "sample" })}>Why is this a prospect?</button>
                </div>
              </article>
            )) : <p className="note">No sample organizations match. Clear the search or change a filter.</p>}
          </div>
          <p className="note">Sample organizations are fictional, for practice and demos.</p>
        </div>

        <aside className="ai">
          {aiOn ? (
          <div className="panel">
            <div>
              <h2>Suggest organizations</h2>
              <p className="note">Describe who you&apos;re looking for. Suggestions are unverified until you check them.{server.jobs ? " Each named organization shows its live job-posting count." : ""}</p>
            </div>
            <label className="f">Looking for
              <textarea id="sq" rows={3} value={form.sq} onChange={setField("sq")} placeholder="e.g. Large employers with high turnover in frontline roles" />
            </label>
            <label className="f">Region
              <input type="text" id="sr" value={form.sr} onChange={setField("sr")} placeholder="e.g. Calgary" />
            </label>
            <div className="row">
              <button className="btn primary" onClick={runSuggest} disabled={sug.busy}>Suggest organizations</button>
            </div>
            {sug.busy ? (
              <p className="status-line"><span className="dots">Thinking</span><button className="btn ghost small" onClick={() => sugCtl.current && sugCtl.current.abort()}>Stop</button></p>
            ) : null}
            {sug.err ? <p className="status-line err">{sug.err}</p> : null}
            {sug.items.length ? (
              <div className="sugg">
                {sug.items.map((x, i) => (
                  <div key={i} className="sugg-item">
                    <span className="unver">{x.kind === "type" ? "Type of organization" : "Unverified suggestion"}</span>
                    <b>{x.name}</b>
                    <span className="note">{[x.sector, x.region].filter(Boolean).join(" · ")}</span>
                    {x.signals.length ? <div className="tags">{x.signals.map((k) => <span key={k} className="tag">{SIGNALS[k]}</span>)}</div> : null}
                    <span>{x.rationale}</span>
                    {x.postings ? <span className="hire">Job postings, last 60 days: {x.postings.count} ({x.postings.peopleRoles} HR or training)</span> : null}
                    {x.verify ? <span className="verify">Check: {x.verify}</span> : null}
                    <div>
                      <button className="btn small" onClick={() => onAnalyzeSuggestion(x)} disabled={x.kind === "type" || ana.busy}
                        title={x.kind === "type" ? "Find a specific organization of this type first" : undefined}>Analyze this one</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          ) : null}

          <details className="panel addorg" open={aiOn || undefined}>
            <summary>
              <h2>{aiOn ? "Analyze an organization" : "Add an organization"}</h2>
              <p className="note">{aiOn
                ? <>Get its fit rating, why it might need Myrimaven, the evidence, and what&apos;s still unknown.{server.jobs ? " Recent job postings are pulled in first." : ""}</>
                : "Found one that isn't in the list? Save it as a prospect and fill in the fit yourself."}</p>
            </summary>
            <label className="f">Organization name
              <input type="text" id="an" value={form.an} onChange={setField("an")} placeholder="e.g. Mount Royal University, Continuing Education" />
            </label>
            <div className="row">
              <label className="f">Website (optional)
                <input type="text" id="aw" value={form.aw} onChange={setField("aw")} placeholder="example.org" />
              </label>
              <label className="f">Region (optional)
                <input type="text" id="ar" value={form.ar} onChange={setField("ar")} placeholder="e.g. Calgary" />
              </label>
            </div>
            <label className="f">What you know or have found
              <textarea id="ax" rows={4} value={form.ax} onChange={setField("ax")} placeholder="Paste a job posting, a news snippet, or notes from a conversation" />
            </label>
            <div className="row">
              {aiOn ? <button className="btn primary" onClick={onAnalyze} disabled={ana.busy}>Analyze</button> : null}
              <button className={aiOn ? "btn" : "btn primary"} onClick={onSaveManual}>{aiOn ? "Save without AI" : "Save as prospect"}</button>
            </div>
            {ana.busy ? (
              <p className="status-line">
                <span className="dots">{ana.step || "Thinking"}</span>
                <span>This can take up to a minute.</span>
                <button className="btn ghost small" onClick={() => anaCtl.current && anaCtl.current.abort()}>Stop</button>
              </p>
            ) : null}
            {ana.err ? <p className="status-line err">{ana.err}</p> : null}
          </details>
        </aside>
      </div>

      {preview ? (
        <PreviewSheet
          preview={preview}
          savedId={savedPreview ? savedPreview.id : null}
          onSave={onSavePreview}
          onClose={closePreview}
          onLeave={clearPreviewUrl}
        />
      ) : null}
    </>
  );
}
