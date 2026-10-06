"use client";

/* "Why is this a prospect?" assessment. Read-only in the preview panel;
   pass the on* handlers to make evidence and unknowns editable on a profile. */

const LABEL = {
  ai: "AI assessment. Use the evidence and unknowns to make your own call.",
  sample: "Prepared assessment for a sample organization.",
  none: "No assessment yet. Add evidence and unknowns as you find them.",
};
const needsVerify = (source) => /verify|general knowledge|^ai$/i.test(source || "");

function submitAndReset(handler) {
  return (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form).entries());
    handler(d);
    form.reset();
  };
}

export default function AnalysisBlock({ analysis: a, by, onToggleEvidence, onToggleUnknown, onAddEvidence, onAddUnknown }) {
  const editable = !!onToggleEvidence;
  return (
    <div className="analysis">
      <p className="ai-label">{LABEL[by] || LABEL.none}</p>
      {a.summary ? <p>{a.summary}</p> : null}

      <div>
        <h4>Potential problems</h4>
        {(a.problems || []).length ? (
          <ul className="list problems">
            {a.problems.map((x, i) => <li key={i}><b>{x.title}</b><span>{x.detail}</span></li>)}
          </ul>
        ) : <p className="note">None identified.</p>}
      </div>

      <div>
        <h4>Supporting evidence{editable ? " · tick what you've checked" : ""}</h4>
        <ul className="list">
          {(a.evidence || []).length ? a.evidence.map((e, i) => (
            <li key={i} className={`ev ${editable && e.checked ? "checked" : ""}`}>
              {editable ? (
                <input type="checkbox" checked={!!e.checked} aria-label="I checked this evidence" onChange={(ev) => onToggleEvidence(i, ev.target.checked)} />
              ) : null}
              <div className="txt">
                {e.text}
                <small className={needsVerify(e.source) && !e.checked ? "verify" : ""}>{e.source}</small>
              </div>
            </li>
          )) : <li className="note">No evidence yet.</li>}
        </ul>
        {editable ? (
          <form className="inline-add" style={{ marginTop: 8 }} onSubmit={submitAndReset((d) => onAddEvidence(d.t.trim(), (d.s || "").trim()))}>
            <input type="text" name="t" id="add-ev" placeholder="Add evidence you found" required />
            <input type="text" name="s" id="add-ev-src" placeholder="Source (e.g. job posting)" style={{ flex: "0 1 170px" }} />
            <button className="btn small">Add</button>
          </form>
        ) : null}
      </div>

      <div>
        <h4>Still to validate</h4>
        <ul className="list">
          {(a.unknowns || []).length ? a.unknowns.map((u, i) => {
            const text = typeof u === "string" ? u : u.text;
            return (
              <li key={i} className={`ev ${editable && u.done ? "done" : ""}`}>
                {editable ? (
                  <input type="checkbox" checked={!!u.done} aria-label="Answered" onChange={(ev) => onToggleUnknown(i, ev.target.checked)} />
                ) : null}
                <div className="txt">{text}</div>
              </li>
            );
          }) : <li className="note">Nothing listed.</li>}
        </ul>
        {editable ? (
          <form className="inline-add" style={{ marginTop: 8 }} onSubmit={submitAndReset((d) => onAddUnknown(d.t.trim()))}>
            <input type="text" name="t" id="add-un" placeholder="Add a question to answer" required />
            <button className="btn small">Add</button>
          </form>
        ) : null}
      </div>

      {(a.roles || []).length ? (
        <div>
          <h4>Who might own the problem</h4>
          <div className="tags" style={{ marginTop: 6 }}>{a.roles.map((r, i) => <span key={i} className="tag">{r}</span>)}</div>
        </div>
      ) : null}

      {(a.fitConcerns || []).length ? (
        <div>
          <h4>Reasons it might not fit</h4>
          <ul className="list concerns">{a.fitConcerns.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
