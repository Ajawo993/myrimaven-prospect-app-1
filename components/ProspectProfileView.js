"use client";

/* /prospects/[id] — Workflow 2 (qualify) and Workflow 3 (contact and learn) */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useProspects } from "./ProspectsProvider";
import { ModeBanner } from "./ProspectListView";
import { FitPill, FitCriteria, HowRate } from "./Fit";
import AnalysisBlock from "./AnalysisBlock";
import { SIGNALS, STATUSES, AUTH, CONNECTIONS, CONN_LABEL, CHANNELS, OUTCOMES, REASONS, REASON_FIT } from "@/lib/constants";
import { CRIT, fitOf } from "@/lib/fit";
import { clone, cls, fmtDate, todayISO, uid } from "@/lib/format";
import { jobsText, jobsEvidence } from "@/lib/prospect";
import { aiAnalysis, fetchJobs, aiErr } from "@/lib/api";

export default function ProspectProfileView() {
  const { id } = useParams();
  const router = useRouter();
  const { prospects, mode, server, aiOn, setAiOff, save, remove, get, toast } = useProspects();
  const p = prospects[id];

  const [rerun, setRerun] = useState({ busy: false, err: "", ctl: null });
  const [jobs, setJobs] = useState({ busy: false, err: "" });
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (p) document.title = `${p.name} · Myrimaven Prospect Desk`;
  }, [p && p.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === "loading") return <p className="muted">Loading…</p>;
  if (!p) {
    return (
      <div className="panel empty">
        <h2>This prospect isn&apos;t saved here</h2>
        <p>Prospects are saved in the browser where you created them. It may have been removed, or saved on another computer.</p>
        <Link className="btn primary" href="/prospects">Back to all prospects</Link>
      </div>
    );
  }

  /* Change a copy of the prospect, save it, and report fit-rating changes */
  function edit(fn, notes = []) {
    const before = fitOf(p).rating;
    const next = clone(p);
    fn(next);
    save(next);
    const after = fitOf(next).rating;
    if (after !== before) notes.push(`fit rating ${before} → ${after}`);
    return notes;
  }

  function setFit(k, v) {
    if (p.fit[k] === v) return;
    const notes = edit((n) => { n.fit[k] = v; delete n.fitWhy[k]; });
    if (notes.length) toast(`Fit rating changed: ${notes[0].replace("fit rating ", "")}.`);
  }

  const setField = (field) => (e) => {
    const value = e.target.value;
    edit((n) => { n[field] = value; });
  };

  function setContactField(contactId, field, value) {
    const notes = edit((n) => {
      const c = n.contacts.find((x) => x.id === contactId);
      if (c) c[field] = value;
    });
    if (notes.length) toast(`Fit rating changed: ${notes[0].replace("fit rating ", "")}.`);
  }

  function onAddContact(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form).entries());
    const notes = edit((n) => {
      n.contacts.push({ id: uid(), name: d.name.trim(), role: d.role.trim(), email: d.email.trim(), phone: d.phone.trim(), authority: d.authority, connection: d.connection, notes: d.notes.trim() });
    });
    form.reset();
    if (notes.length) toast(`Contact added. Fit rating changed: ${notes[0].replace("fit rating ", "")}.`);
  }

  function onLogOutreach(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form).entries());
    const notes = [];
    edit((n) => {
      const c = n.contacts.find((x) => x.id === d.contactId);
      n.outreach.push({ id: uid(), date: d.date, contactId: d.contactId, connection: c ? c.connection : "Unknown", channel: d.channel, outcome: d.outcome, reason: d.reason, learned: d.learned.trim() });
      if (n.outreach.length === 1 && ["Needs Validation", "Potential Fit"].includes(n.status)) {
        n.status = "Contacted";
        notes.push("Status set to Contacted");
      }
      const k = REASON_FIT[d.reason];
      if (k && n.fit[k] !== "no") {
        n.fit[k] = "no";
        n.fitWhy[k] = `From outreach on ${fmtDate(d.date)}: ${d.reason.toLowerCase()}.`;
        notes.push(`"${CRIT.find((x) => x.k === k).label}" set to No`);
      }
    }, notes);
    form.reset();
    toast(["Logged", ...notes].join(". ") + ".");
  }

  async function onRerun() {
    if (!aiOn) return;
    const ctl = new AbortController();
    setRerun({ busy: true, err: "", ctl });
    const notes = [
      p.summary && "Summary: " + p.summary,
      p.analysis.evidence.length && "Evidence so far:\n" + p.analysis.evidence.map((e) => `- ${e.text} (${e.source}${e.checked ? ", checked by Joan" : ""})`).join("\n"),
      p.contacts.length && "Contacts:\n" + p.contacts.map((c) => `- ${c.role} (${c.authority}, ${c.connection})`).join("\n"),
      p.outreach.length && "Outreach so far:\n" + p.outreach.map((o) => `- ${o.date} ${o.channel}: ${o.outcome}${o.reason ? " (" + o.reason + ")" : ""}. ${o.learned}`).join("\n"),
      p.jobs && jobsText(p.jobs),
      p.notes && "Joan's notes: " + p.notes,
    ].filter(Boolean).join("\n\n");
    try {
      const a = await aiAnalysis(p.name, p.website, notes, ctl.signal);
      const latest = get(p.id);
      if (!latest) return;
      const next = clone(latest);
      const keepEv = next.analysis.evidence.filter((e) => e.checked || e.mine);
      const keepUn = next.analysis.unknowns.filter((u) => u.done || u.mine);
      const seen = new Set(keepEv.map((e) => e.text.toLowerCase()));
      next.analysis = {
        problems: a.problems || [], roles: a.roles || [], fitConcerns: a.fitConcerns || [], generatedBy: "ai", generatedAt: todayISO(),
        evidence: keepEv.concat((a.evidence || []).filter((e) => !seen.has(e.text.toLowerCase())).map((e) => ({ ...e, checked: false }))),
        unknowns: keepUn.concat((a.unknowns || []).filter((t) => !keepUn.some((u) => u.text.toLowerCase() === t.toLowerCase())).map((t) => ({ text: t, done: false }))),
      };
      /* AI only fills criteria Joan hasn't decided yet */
      Object.entries(a.fit || {}).forEach(([k, v]) => {
        if (next.fit[k] === "unknown" && v !== "unknown") {
          next.fit[k] = v;
          if (a.fitWhy && a.fitWhy[k]) next.fitWhy[k] = a.fitWhy[k];
        }
      });
      if (a.summary && !next.summary) next.summary = a.summary;
      save(next);
      setRerun({ busy: false, err: "", ctl: null });
      toast("Assessment updated. Your checked evidence, unknowns and fit answers were kept.");
    } catch (e) {
      const [msg, off] = aiErr(e);
      if (off) setAiOff(true);
      setRerun({ busy: false, err: msg, ctl: null });
    }
  }

  async function onCheckJobs() {
    setJobs({ busy: true, err: "" });
    try {
      const j = await fetchJobs(p.name, p.region);
      const latest = get(p.id);
      if (!latest) return;
      const next = clone(latest);
      next.jobs = j;
      next.analysis.evidence = next.analysis.evidence.filter((e) => !/^Adzuna/.test(e.source));
      next.analysis.evidence.unshift(jobsEvidence(j));
      let msg = `Found ${j.count} postings.`;
      if (j.count >= 5 && next.fit.hiring !== "yes") {
        next.fit.hiring = "yes";
        next.fitWhy.hiring = `${j.count} postings on Adzuna in the last ${j.searched.days} days.`;
        msg += ' Set "Active hiring" to Yes.';
      }
      save(next);
      setJobs({ busy: false, err: "" });
      toast(msg);
    } catch (e) {
      setJobs({ busy: false, err: e && e.code === "not_configured" ? "Job postings aren't connected in this version." : "Couldn't check job postings. Try again." });
    }
  }

  const f = fitOf(p);
  const contactName = (cid) => {
    const c = p.contacts.find((x) => x.id === cid);
    return c ? `${c.name} (${c.role})` : "Contact not listed";
  };
  const showJobs = server.jobs || p.jobs;

  return (
    <>
      <Link className="btn ghost back" href="/prospects">← All prospects</Link>
      <ModeBanner mode={mode} />

      <section className="phead">
        <div>
          <p className="eyebrow">Prospect{p.example ? " · Example" : ""}</p>
          <h1 style={{ marginTop: 4 }}>{p.name}</h1>
          <p className="meta">
            {[p.sector, p.size, p.region].filter(Boolean).join(" · ") || "Add sector and size in Details"}
            {p.website ? <> · <span className="mono">{p.website}</span></> : null}
          </p>
          {p.signals.length ? <div className="tags" style={{ marginTop: 8 }}>{p.signals.map((s) => <span key={s} className="tag">{SIGNALS[s] || s}</span>)}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <FitPill f={f} />
          <span className={`pill st-${cls(p.status)}`}>{p.status}</span>
        </div>
      </section>

      <div className="profile">
        <div className="col">
          <section className="panel">
            <div className="panel-head">
              <h2>Why is this a prospect?</h2>
              <button className="btn small" onClick={onRerun} disabled={!aiOn || rerun.busy}
                title={!aiOn ? "AI isn't connected in this version" : "Update the assessment using your evidence, contacts and outreach"}>
                {rerun.busy ? <span className="dots">Updating</span> : p.analysis.generatedBy === "none" ? "Assess with AI" : "Update with AI"}
              </button>
            </div>
            {rerun.busy ? (
              <p className="status-line">This can take up to a minute. <button className="btn ghost small" onClick={() => rerun.ctl && rerun.ctl.abort()}>Stop</button></p>
            ) : null}
            {rerun.err ? <p className="status-line err">{rerun.err}</p> : null}
            {p.summary ? <p>{p.summary}</p> : null}
            <AnalysisBlock
              analysis={p.analysis}
              by={p.analysis.generatedBy}
              onToggleEvidence={(i, v) => edit((n) => { n.analysis.evidence[i].checked = v; })}
              onToggleUnknown={(i, v) => edit((n) => { n.analysis.unknowns[i].done = v; })}
              onAddEvidence={(text, source) => text && edit((n) => { n.analysis.evidence.push({ text, source: source || "Added by Joan", checked: true, mine: true }); })}
              onAddUnknown={(text) => text && edit((n) => { n.analysis.unknowns.push({ text, done: false, mine: true }); })}
            />
          </section>

          {showJobs ? (
            <section className="panel">
              <div className="panel-head">
                <h2>Hiring activity</h2>
                {server.jobs ? (
                  <button className="btn small" onClick={onCheckJobs} disabled={jobs.busy}>
                    {jobs.busy ? <span className="dots">Checking</span> : p.jobs ? "Check again" : "Check job postings"}
                  </button>
                ) : null}
              </div>
              {jobs.err ? <p className="status-line err">{jobs.err}</p> : null}
              {p.jobs ? (
                <div className="postings">
                  <p>
                    <b className="mono">{p.jobs.count}</b> postings in the last {p.jobs.searched.days} days, <b className="mono">{p.jobs.peopleRoles}</b> in HR, training or talent roles.{" "}
                    <span className="note">Adzuna, checked {fmtDate(p.jobs.checkedAt)}.</span>
                  </p>
                  {p.jobs.sample.length ? (
                    <ul>
                      {p.jobs.sample.map((x, i) => (
                        <li key={i}>
                          {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a> : x.title}{" "}
                          <span className="note">· {x.location}{x.created ? " · " + fmtDate(x.created) : ""}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="note">Matched by employer name, so check that the postings are really theirs.</p>
                </div>
              ) : <p className="note">Pull recent job postings for {p.name} as evidence of hiring or workforce change.</p>}
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-head">
              <h2>Outreach and what you learned</h2>
              <span className="note">{p.outreach.length} logged</span>
            </div>
            {p.outreach.length ? (
              <ul className="log">
                {p.outreach.slice().sort((a, b) => b.date.localeCompare(a.date)).map((o) => (
                  <li key={o.id}>
                    <span className="d">{fmtDate(o.date)}</span>
                    <div className="what">
                      <div>
                        <span className={`oc oc-${cls(o.outcome)}`}>{o.outcome}</span>{" "}
                        <span className="note">· {o.channel} · {contactName(o.contactId)}{o.connection ? " · " + o.connection : ""}</span>
                      </div>
                      {o.reason ? <span className="note">Reason: {o.reason}</span> : null}
                      {o.learned ? <p className="learned">{o.learned}</p> : null}
                      <div>
                        <button className="btn ghost small danger" onClick={() => edit((n) => { n.outreach = n.outreach.filter((x) => x.id !== o.id); })}>Remove entry</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note">No outreach yet. When you contact someone, log it here, including a no. A no tells you which organizations to skip next time.</p>
            )}
            <details className="form" open={!p.outreach.length}>
              <summary>Log outreach</summary>
              <form className="stack" onSubmit={onLogOutreach}>
                <div className="row">
                  <label className="f">Date<input type="date" name="date" id="o-date" defaultValue={todayISO()} required /></label>
                  <label className="f">Contact
                    <select name="contactId" id="o-contact" defaultValue="">
                      <option value="">Not listed</option>
                      {p.contacts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.role}</option>)}
                    </select>
                  </label>
                </div>
                <div className="row">
                  <label className="f">Channel<select name="channel" id="o-channel">{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></label>
                  <label className="f">Response<select name="outcome" id="o-outcome">{OUTCOMES.map((c) => <option key={c}>{c}</option>)}</select></label>
                </div>
                <label className="f">If it wasn&apos;t a fit, why?
                  <select name="reason" id="o-reason" defaultValue="">
                    <option value="">Not applicable</option>
                    {REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
                <label className="f">What did you learn?
                  <textarea name="learned" id="o-learned" rows={2} placeholder="e.g. Retention budget sits with the VP, not HR" />
                </label>
                <div><button className="btn primary">Add to log</button></div>
              </form>
            </details>
          </section>
        </div>

        <div className="col">
          <section className="panel">
            <h2>Fit rating</h2>
            <FitCriteria prospect={p} onSet={setFit} />
            <HowRate />
          </section>

          <section className="panel">
            <h2>Status and next step</h2>
            <label className="f">Status
              <select id="p-status" value={p.status} onChange={setField("status")}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="f">{p.status === "Not a Fit" ? "Why isn't it a fit?" : "Why this status?"}
              <textarea id="p-fitnote" rows={2} value={p.fitNote} onChange={setField("fitNote")} placeholder={p.status === "Not a Fit" ? "This feeds your Learnings" : "Optional"} />
            </label>
            <label className="f">Next action
              <input type="text" id="p-next" value={p.nextAction} onChange={setField("nextAction")} placeholder="e.g. Ask for an intro to the VP People" />
            </label>
            <label className="f">Follow-up date
              <input type="date" id="p-fu" value={p.followUpDate} onChange={setField("followUpDate")} />
            </label>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Contacts</h2>
              <span className="note">{p.contacts.some((c) => c.authority === "Decision-maker") ? "Decision-maker identified" : "No decision-maker yet"}</span>
            </div>
            {p.contacts.length ? p.contacts.map((c) => (
              <div key={c.id} className="contact">
                <div className="top">
                  <div><b>{c.name}</b><div className="info">{c.role}</div></div>
                  <select className={`auth-${cls(c.authority)}`} aria-label={`Purchasing authority for ${c.name}`} value={c.authority}
                    onChange={(e) => setContactField(c.id, "authority", e.target.value)}>
                    {AUTH.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="row" style={{ alignItems: "center" }}>
                  <span className="note" style={{ flex: "0 0 auto" }}>Connection</span>
                  <select aria-label={`Connection to ${c.name}`} value={c.connection}
                    style={{ flex: "0 0 auto", width: "auto", padding: "3px 6px", fontSize: ".82rem" }}
                    onChange={(e) => setContactField(c.id, "connection", e.target.value)}>
                    {CONNECTIONS.map((a) => <option key={a} value={a}>{CONN_LABEL[a]}</option>)}
                  </select>
                </div>
                {c.email || c.phone ? <div className="info mono">{[c.email, c.phone].filter(Boolean).join(" · ")}</div> : null}
                {c.notes ? <div className="info">{c.notes}</div> : null}
                <div>
                  <button className="btn ghost small danger" onClick={() => edit((n) => { n.contacts = n.contacts.filter((x) => x.id !== c.id); })}>Remove</button>
                </div>
              </div>
            )) : (
              <p className="note">Who owns this problem or its budget? {p.analysis.roles.length ? `Suggested roles: ${p.analysis.roles.join(", ")}.` : ""}</p>
            )}
            <details className="form" open={!p.contacts.length}>
              <summary>Add a contact</summary>
              <form className="stack" onSubmit={onAddContact}>
                <div className="row">
                  <label className="f">Name<input type="text" name="name" id="c-name" required placeholder="Name, or 'unknown'" /></label>
                  <label className="f">Role<input type="text" name="role" id="c-role" required placeholder="e.g. Director of L&D" /></label>
                </div>
                <div className="row">
                  <label className="f">Email<input type="text" name="email" id="c-email" /></label>
                  <label className="f">Phone<input type="text" name="phone" id="c-phone" /></label>
                </div>
                <div className="row">
                  <label className="f">Purchasing authority
                    <select name="authority" id="c-auth" defaultValue="Unknown">{AUTH.map((a) => <option key={a}>{a}</option>)}</select>
                  </label>
                  <label className="f">Connection
                    <select name="connection" id="c-conn" defaultValue="Warm">{CONNECTIONS.map((a) => <option key={a} value={a}>{CONN_LABEL[a]}</option>)}</select>
                  </label>
                </div>
                <label className="f">Notes<input type="text" name="notes" id="c-notes" placeholder="How you know them, what they care about" /></label>
                <div><button className="btn primary">Add contact</button></div>
              </form>
            </details>
          </section>

          <section className="panel">
            <h2>Notes</h2>
            <textarea id="p-notes" rows={4} value={p.notes} onChange={setField("notes")} placeholder="Anything else worth remembering" />
            <details className="form">
              <summary>Details</summary>
              <div className="stack" style={{ marginTop: 10 }}>
                <label className="f">Sector<input type="text" id="p-sector" value={p.sector} onChange={setField("sector")} /></label>
                <label className="f">Size<input type="text" id="p-size" value={p.size} onChange={setField("size")} /></label>
                <label className="f">Region<input type="text" id="p-region" value={p.region} onChange={setField("region")} /></label>
                <label className="f">Website<input type="text" id="p-web" value={p.website} onChange={setField("website")} /></label>
              </div>
            </details>
            <div className="confirm">
              {confirmDel ? (
                <>
                  <span>Remove this prospect and its history?</span>
                  <button className="btn small danger" onClick={() => { remove(p.id); router.push("/prospects"); toast("Prospect removed."); }}>Remove</button>
                  <button className="btn small" onClick={() => setConfirmDel(false)}>Keep</button>
                </>
              ) : (
                <button className="btn ghost small danger" onClick={() => setConfirmDel(true)}>Remove prospect</button>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
