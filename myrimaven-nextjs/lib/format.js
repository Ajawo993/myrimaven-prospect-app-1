export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const cls = (v) => String(v).replace(/[^A-Za-z]/g, "");

export function todayISO(off = 0) {
  const d = new Date();
  d.setDate(d.getDate() + off);
  const z = d.getTimezoneOffset() * 60000;
  return new Date(d - z).toISOString().slice(0, 10);
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function whenClass(iso) {
  const t = todayISO();
  return iso < t ? "over" : iso === t ? "today" : "later";
}

export function whenText(iso) {
  const t = todayISO();
  if (iso < t) return "Overdue · " + fmtDate(iso);
  if (iso === t) return "Today";
  return fmtDate(iso);
}
