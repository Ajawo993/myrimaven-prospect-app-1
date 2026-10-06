"use client";

/* /learnings — what outreach is teaching Myrimaven, including from every no */

import { useProspects } from "./ProspectsProvider";
import { STATUSES, CONNECTIONS, CONN_LABEL } from "@/lib/constants";
import { cls, fmtDate } from "@/lib/format";

const POSITIVE = ["Interested", "Meeting booked"];

export default function LearningsView() {
  const { list, mode, loadExamples } = useProspects();

  if (mode === "loading") return <p className="muted">Loading…</p>;

  const head = (
    <section>
      <p className="eyebrow">Learnings</p>
      <h1>What outreach is teaching you</h1>
      <p className="lede muted" style={{ marginTop: 10, maxWidth: "60ch" }}>
        Every response, including no response, is evidence about who Myrimaven&apos;s customer is. This page collects it.
      </p>
    </section>
  );

  if (!list.length) {
    return (
      <>
        {head}
        <div className="panel empty">
          <h2>Nothing to learn from yet</h2>
          <p>Log outreach on a prospect and the reasons and lessons collect here.</p>
          <button className="btn" onClick={loadExamples}>Load 3 examples</button>
        </div>
      </>
    );
  }

  const entries = list.flatMap((p) => p.outreach.map((o) => ({
    ...o,
    org: p.name,
    sector: p.sector,
    conn: o.connection || (p.contacts.find((c) => c.id === o.contactId) || {}).connection || "Unknown",
  })));

  const reasons = {};
  entries.filter((e) => e.reason).forEach((e) => { (reasons[e.reason] = reasons[e.reason] || []).push(e); });
  list.filter((p) => p.status === "Not a Fit" && p.fitNote).forEach((p) => {
    (reasons["Marked Not a Fit"] = reasons["Marked Not a Fit"] || []).push({ org: p.name, sector: p.sector, learned: p.fitNote });
  });
  const reasonList = Object.entries(reasons).sort((a, b) => b[1].length - a[1].length);

  const conn = {};
  entries.forEach((e) => {
    const c = (conn[e.conn] = conn[e.conn] || { n: 0, replied: 0, positive: 0 });
    c.n++;
    if (e.outcome !== "No response") c.replied++;
    if (POSITIVE.includes(e.outcome)) c.positive++;
  });

  const sectors = {};
  list.forEach((p) => {
    const k = p.sector || "Sector not set";
    const s = (sectors[k] = sectors[k] || { n: 0, contacted: 0, positive: 0, nofit: 0 });
    s.n++;
    if (p.outreach.length) s.contacted++;
    if (p.outreach.some((o) => POSITIVE.includes(o.outcome))) s.positive++;
    if (p.status === "Not a Fit") s.nofit++;
  });

  const feed = entries.filter((e) => e.learned).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      {head}
      <div className="stats">
        {STATUSES.map((s) => (
          <div key={s} className="stat"><b>{list.filter((p) => p.status === s).length}</b><span className={`pill st-${cls(s)}`}>{s}</span></div>
        ))}
      </div>

      <div className="learn">
        <div className="col">
          <section className="panel">
            <h2>Why prospects weren&apos;t a fit</h2>
            {reasonList.length ? reasonList.map(([r, es]) => (
              <div key={r} className="reason">
                <div className="rh"><span>{r}</span><span className="mono">{es.length}</span></div>
                <ul>
                  {es.map((e, i) => (
                    <li key={i}><b>{e.org}</b>{e.sector ? ` (${e.sector})` : ""}{e.learned ? `: ${e.learned}` : ""}</li>
                  ))}
                </ul>
              </div>
            )) : <p className="note">When a contact says no, pick a reason in the outreach log. Patterns show up here.</p>}
          </section>

          <section className="panel">
            <h2>Warm vs. cold</h2>
            {Object.keys(conn).length ? (
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Connection</th><th className="n">Outreach</th><th className="n">Got a reply</th><th className="n">Interested</th></tr></thead>
                  <tbody>
                    {CONNECTIONS.filter((k) => conn[k]).map((k) => (
                      <tr key={k}><td>{CONN_LABEL[k]}</td><td className="n">{conn[k].n}</td><td className="n">{conn[k].replied}</td><td className="n">{conn[k].positive}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="note">Log outreach to compare warm, referral and cold contacts.</p>}
            <p className="note">Tests whether warm contacts really reply more often than cold ones.</p>
          </section>

          <section className="panel">
            <h2>Responses by sector</h2>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Sector</th><th className="n">Prospects</th><th className="n">Contacted</th><th className="n">Interested</th><th className="n">Not a fit</th></tr></thead>
                <tbody>
                  {Object.entries(sectors).sort((a, b) => b[1].n - a[1].n).map(([k, s]) => (
                    <tr key={k}><td>{k}</td><td className="n">{s.n}</td><td className="n">{s.contacted}</td><td className="n">{s.positive}</td><td className="n">{s.nofit}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">Counts only. With this few conversations, read them as hints, not trends.</p>
          </section>
        </div>

        <section className="panel">
          <h2>Lessons, newest first</h2>
          {feed.length ? (
            <ul className="log">
              {feed.map((e) => (
                <li key={e.id}>
                  <span className="d">{fmtDate(e.date)}</span>
                  <div className="what">
                    <div><b>{e.org}</b> <span className={`oc oc-${cls(e.outcome)}`}>· {e.outcome}</span></div>
                    <p className="learned">{e.learned}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="note">Nothing written yet. Use &ldquo;What did you learn?&rdquo; when you log outreach.</p>}
        </section>
      </div>
    </>
  );
}
