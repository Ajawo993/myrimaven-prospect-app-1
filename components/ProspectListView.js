"use client";

/* /prospects — follow-ups, status, and the prospect list sorted by fit */

import { useState } from "react";
import Link from "next/link";
import { useProspects } from "./ProspectsProvider";
import { FitPill, HowRate } from "./Fit";
import { STATUSES } from "@/lib/constants";
import { CRIT, fitOf, fitSort } from "@/lib/fit";
import { cls, fmtDate, whenClass, whenText } from "@/lib/format";
import { prospectsCsv, outreachCsv, downloadCsv } from "@/lib/csv";

const SORTERS = {
  fit: fitSort,
  followup: (a, b) => (a.followUpDate || "9999").localeCompare(b.followUpDate || "9999"),
  updated: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
};

export function ModeBanner({ mode }) {
  if (mode !== "memory") return null;
  return <p className="banner">This browser can&apos;t save, so prospects last until you close the page.</p>;
}

export default function ProspectListView() {
  const { list, mode, clearAll, loadExamples, toast } = useProspects();
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("fit");
  const [confirmClear, setConfirmClear] = useState(false);

  if (mode === "loading") return <p className="muted">Loading your prospects…</p>;

  const head = (
    <>
      <section className="head-row">
        <div><p className="eyebrow">Prospects</p><h1>Your prospects</h1></div>
        <div className="row" style={{ flex: "0 0 auto" }}>
          {list.length ? (confirmClear ? (
            <span className="confirm">
              Remove all prospects?
              <button className="btn small danger" onClick={() => { clearAll(); setConfirmClear(false); toast("All prospects removed."); }}>Remove all</button>
              <button className="btn small" onClick={() => setConfirmClear(false)}>Keep</button>
            </span>
          ) : (
            <button className="btn ghost small danger" onClick={() => setConfirmClear(true)}>Clear all</button>
          )) : null}
          <Link className="btn" href="/discover">Find more organizations</Link>
        </div>
      </section>
      <ModeBanner mode={mode} />
    </>
  );

  if (!list.length) {
    return (
      <>
        {head}
        <div className="panel empty">
          <h2>No prospects yet</h2>
          <p>Save an organization from Discover when it looks worth investigating. To see how a qualified prospect looks, load three worked examples.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="btn primary" href="/discover">Go to Discover</Link>
            <button className="btn" onClick={loadExamples}>Load 3 examples</button>
          </div>
        </div>
      </>
    );
  }

  const followUps = list
    .filter((p) => p.followUpDate && p.status !== "Not a Fit")
    .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, list.filter((p) => p.status === s).length]));
  const rows = list.filter((p) => statusFilter === "all" || p.status === statusFilter).sort(SORTERS[sort]);

  return (
    <>
      {head}

      <section className="panel">
        <div className="panel-head">
          <h2>Follow-ups</h2>
          <span className="note">{followUps.length ? `${followUps.length} scheduled` : "Set a next step on a prospect to see it here"}</span>
        </div>
        {followUps.length ? (
          <div className="fu">
            {followUps.map((p) => (
              <Link key={p.id} className="fu-item" href={`/prospects/${p.id}`}>
                <span className={`when ${whenClass(p.followUpDate)}`}>{whenText(p.followUpDate)}</span>
                <b>{p.name}</b>
                <span className="note">{p.nextAction || "No action written yet"}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <div className="toolbar">
        <div className="chips">
          {[["all", `All (${list.length})`], ...STATUSES.map((s) => [s, `${s} (${counts[s]})`])].map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={statusFilter === k} onClick={() => setStatusFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="row" style={{ flex: "0 0 auto" }}>
          <label className="f" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>Sort
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="fit">Best fit first</option>
              <option value="followup">Follow-up date</option>
              <option value="updated">Recently updated</option>
            </select>
          </label>
          <button className="btn small" onClick={() => downloadCsv("myrimaven-prospects.csv", prospectsCsv(list))}>Export prospects (CSV)</button>
          <button className="btn small" onClick={() => downloadCsv("myrimaven-outreach.csv", outreachCsv(list))}>Export outreach (CSV)</button>
        </div>
      </div>

      <div className="plist">
        <div className="prow hdr"><span>Organization</span><span>Fit</span><span>Status</span><span>Main problem</span><span>Next step</span><span>Follow-up</span></div>
        {rows.length ? rows.map((p) => {
          const f = fitOf(p);
          return (
            <Link key={p.id} className="prow" href={`/prospects/${p.id}`}>
              <span className="nm">
                <b>{p.name}{p.example ? <span className="ex">Example</span> : null}</b>
                <span>
                  {p.sector || "Sector not set"} · {p.contacts.length} contact{p.contacts.length === 1 ? "" : "s"}
                  {p.contacts.some((c) => c.authority === "Decision-maker") ? " · decision-maker found" : ""}
                </span>
              </span>
              <span className="c-fit"><FitPill f={f} /> <span className="note mono">{f.yes.length}/{CRIT.length}</span></span>
              <span className="c-status"><span className={`pill st-${cls(p.status)}`}>{p.status}</span></span>
              <span className="cell c-problem">{p.analysis.problems[0] ? p.analysis.problems[0].title : "Not identified"}</span>
              <span className="cell c-next muted">{p.nextAction || "—"}</span>
              <span className="cell c-fu">{p.followUpDate ? <span className={`when mono ${whenClass(p.followUpDate)}`}>{fmtDate(p.followUpDate)}</span> : null}</span>
            </Link>
          );
        }) : <p className="note" style={{ padding: 16 }}>No prospects with this status.</p>}
      </div>
      <HowRate />
    </>
  );
}
