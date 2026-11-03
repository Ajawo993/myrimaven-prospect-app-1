"use client";

import { CRIT, fitOf } from "@/lib/fit";

export function FitPill({ f }) {
  return <span className={`fit fit-${f.rating}`}>{f.rating} fit</span>;
}

export function HowRate() {
  return (
    <details className="howrate">
      <summary>How the fit rating works</summary>
      <p>
        The rating counts which of Joan&apos;s eight criteria are met. It is not a prediction. <b>Strong</b> = 5 or more met.{" "}
        <b>Moderate</b> = 3 or 4 met. <b>Weak</b> = 2 or fewer, or a &ldquo;No&rdquo; on a must-have: serves adults, has a career
        alignment problem, open to outside tools. Every criterion can be changed on the prospect, and contacts and outreach update
        it as you go.
      </p>
    </details>
  );
}

const MARK = { yes: "✓", no: "✕", unknown: "?" };
const OPTION = { yes: "Yes", no: "No", unknown: "?" };

/* Read-only summary (onSet omitted) or editable list of criteria */
export function FitCriteria({ prospect, onSet }) {
  const f = fitOf(prospect);
  const why = prospect.fitWhy || {};
  const head = (
    <div className="fitline">
      <FitPill f={f} />
      <span>
        Meets {f.yes.length} of {CRIT.length}
        {f.unk.length ? ` · ${f.unk.length} unknown` : ""}
        {f.deal.length ? " · No on a must-have" : ""}
      </span>
    </div>
  );

  if (!onSet) {
    return (
      <>
        {head}
        <ul className="mini-crit" style={{ marginTop: 8 }}>
          {CRIT.map((c) => (
            <li key={c.k}><span className={`mark ${f.v[c.k]}`}>{MARK[f.v[c.k]]}</span>{c.label}</li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      {head}
      <ul className="crit">
        {CRIT.map((c) => {
          const v = f.v[c.k];
          const auto = f.auto[c.k];
          return (
            <li key={c.k}>
              <span className="cl">{c.label}{c.deal ? <span className="deal">Must-have</span> : null}</span>
              <span className="seg" role="group" aria-label={c.label}>
                {["yes", "no", "unknown"].map((o) => (
                  <button key={o} type="button" className={`v-${o}`} aria-pressed={v === o} disabled={!!auto} onClick={() => onSet(c.k, o)}>
                    {OPTION[o]}
                  </button>
                ))}
              </span>
              <span className="ch">{auto ? "Set from your contacts" : c.hint}</span>
              {why[c.k] && !auto ? <span className="why">{why[c.k]}</span> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
