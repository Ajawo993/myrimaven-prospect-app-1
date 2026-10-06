"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { decodeFit } from "@/lib/fit";
import { FitCriteria } from "./Fit";
import AnalysisBlock from "./AnalysisBlock";

/* Side panel answering "Why might this organization need Myrimaven?" before saving */
export default function PreviewSheet({ preview, savedId, onSave, onClose }) {
  const primary = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (primary.current) primary.current.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const { org, analysis, by } = preview;
  const pseudo = {
    fit: org.fit ? decodeFit(org.fit) : Object.assign(decodeFit(""), analysis.fit || {}),
    fitWhy: analysis.fitWhy || {},
    contacts: [],
  };

  return (
    <>
      <div className="scrim" onClick={onClose}></div>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={org.name}>
        <div className="sheet-head">
          <div>
            <p className="eyebrow">Why might this organization need Myrimaven?</p>
            <h2 style={{ marginTop: 4 }}>{org.name}</h2>
            <p className="note" style={{ marginTop: 4 }}>{[org.sector, org.size, org.region].filter(Boolean).join(" · ")}</p>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Close">Close</button>
        </div>
        {org.summary && by !== "ai" ? <p>{org.summary}</p> : null}
        <div>
          <h4 style={{ marginBottom: 8 }}>Fit against your criteria</h4>
          <FitCriteria prospect={pseudo} />
        </div>
        <AnalysisBlock analysis={analysis} by={by} />
        <div className="sheet-actions">
          {savedId ? (
            <Link ref={primary} className="btn primary" href={`/prospects/${savedId}`}>Open saved prospect</Link>
          ) : (
            <button ref={primary} className="btn primary" onClick={onSave}>Save as prospect</button>
          )}
          <button className="btn" onClick={onClose}>Not now</button>
        </div>
      </aside>
    </>
  );
}
