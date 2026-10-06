import { fitOf, fitSort } from "./fit";

function toCsv(rows) {
  return rows
    .map((r) => r.map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\r\n");
}

export function prospectsCsv(list) {
  const rows = [["Organization", "Sector", "Size", "Region", "Fit rating", "Criteria met", "Criteria not met", "Status", "Main problem", "Contacts", "Last outreach", "Next action", "Follow-up date", "Notes"]];
  list.slice().sort(fitSort).forEach((p) => {
    const f = fitOf(p);
    const last = p.outreach.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    rows.push([
      p.name, p.sector, p.size, p.region, f.rating,
      f.yes.map((c) => c.label).join("; "), f.no.map((c) => c.label).join("; "), p.status,
      p.analysis.problems[0] ? p.analysis.problems[0].title : "",
      p.contacts.map((c) => `${c.name} (${c.role}, ${c.authority}, ${c.connection})`).join("; "),
      last ? `${last.date} ${last.outcome}` : "", p.nextAction, p.followUpDate, p.notes,
    ]);
  });
  return toCsv(rows);
}

export function outreachCsv(list) {
  const body = [];
  list.forEach((p) => p.outreach.forEach((o) => {
    const c = p.contacts.find((x) => x.id === o.contactId);
    body.push([o.date, p.name, c ? c.name : "", c ? c.role : "", o.connection || (c && c.connection) || "", o.channel, o.outcome, o.reason, o.learned]);
  }));
  body.sort((a, b) => b[0].localeCompare(a[0]));
  return toCsv([["Date", "Organization", "Contact", "Role", "Connection", "Channel", "Response", "Reason not a fit", "What was learned"], ...body]);
}

export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
