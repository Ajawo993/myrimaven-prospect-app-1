"use client";

/* /settings — Updates & calendar.
   Daily update: one email a day to you (never to prospects) with what's due and Claude's draft follow-ups.
   Google Calendar: each follow-up date becomes an all-day event on your calendar, kept in sync. */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProspects } from "./ProspectsProvider";
import { getUpdates, setUpdates, sendTestUpdate, calendarStart, calendarSync, calendarDisconnect } from "@/lib/api";

const RETURN_MSG = {
  connected: "Google Calendar connected. Your follow-up dates are on it now.",
  cancelled: "Google Calendar wasn't connected: access was cancelled on Google's page.",
  expired: "That connection link expired. Try Connect Google Calendar again.",
  failed: "Google Calendar couldn't be connected. Try again, and check the setup notes if it keeps happening.",
};

const errText = (e, fallback) => (e && e.message) || (e && e.code === "signed_out" ? "Your sign-in has expired. Sign in again." : fallback);

export default function SettingsView() {
  const { mode, toast, setCalendarOn, list } = useProspects();
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState(null); // { config, settings }
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = () => getUpdates().then((r) => { setData(r); setErr(""); if (r.settings) setCalendarOn(r.settings.calendar.connected); })
    .catch((e) => setErr(errText(e, "Couldn't load your settings.")));

  useEffect(() => {
    if (mode !== "cloud") return;
    load();
    const back = params.get("calendar");
    if (back && RETURN_MSG[back]) {
      toast(RETURN_MSG[back]);
      router.replace("/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const head = (
    <section>
      <p className="eyebrow">Updates &amp; calendar</p>
      <h1>Stay on top of follow-ups</h1>
      <p className="lede muted" style={{ marginTop: 10, maxWidth: "62ch" }}>
        A daily email to you with what&apos;s due, and your follow-up dates on Google Calendar. Prospect Desk never emails a prospect:
        any message in the update is a draft for you to edit and send yourself.
      </p>
    </section>
  );

  if (mode === "loading") return <p className="muted">Loading…</p>;
  if (mode !== "cloud") return <>{head}<p className="banner">Sign in to use the daily update and Google Calendar.</p></>;
  if (err) return <>{head}<p className="banner">{err}</p></>;
  if (!data) return <>{head}<p className="muted">Loading…</p></>;

  const { config, settings: s } = data;
  const due = list.filter((p) => p.followUpDate && p.status !== "Not a Fit").length;

  async function run(key, fn, okMsg) {
    setBusy(key);
    try {
      const r = await fn();
      if (r && r.settings) setData((d) => ({ ...d, settings: r.settings }));
      if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg);
      return r;
    } catch (e) {
      toast(errText(e, "That didn't work. Try again in a minute."));
      if (e && e.code === "calendar_expired") load();
      return null;
    } finally {
      setBusy("");
    }
  }

  const toggleEmail = (on) => run("toggle", () => setUpdates(on, Intl.DateTimeFormat().resolvedOptions().timeZone),
    on ? "Daily update on. It arrives around 7 a.m." : "Daily update off.");

  const connect = async () => {
    const r = await run("connect", calendarStart);
    if (r && r.url) window.location.href = r.url;
  };

  return (
    <>
      {head}

      <section className="panel">
        <div className="panel-head">
          <h2>Daily update email</h2>
          {s && s.dailyEmail ? <span className="saved">On</span> : null}
        </div>
        {!config.email ? (
          <p className="note">Not set up on this server yet. It needs RESEND_API_KEY and SUPABASE_SECRET_KEY in Vercel.</p>
        ) : (
          <>
            <label className="toggle switch-row">
              <input type="checkbox" checked={!!s.dailyEmail} disabled={busy === "toggle"} onChange={(e) => toggleEmail(e.target.checked)} />
              <span>Email me each morning (about 7 a.m.) when follow-ups are due or coming up</span>
            </label>
            <p className="note">
              Goes to <b>{s.email}</b>. Claude writes a short summary and a first-draft message for each follow-up that&apos;s due;
              if the AI is unavailable, you still get the plain list. Days with nothing due are skipped.
              {s.lastSent ? ` Last sent ${s.lastSent}.` : ""}
            </p>
            <div className="row">
              <button type="button" className="btn" disabled={!!busy} onClick={() => run("test", sendTestUpdate, (r) => `Sent: "${r.subject}". Check your inbox.`)}>
                {busy === "test" ? "Sending…" : "Send me one now"}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Google Calendar</h2>
          {s && s.calendar.connected ? <span className="saved">Connected</span> : null}
        </div>
        {!config.calendar ? (
          <p className="note">Not set up on this server yet. It needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SUPABASE_SECRET_KEY in Vercel.</p>
        ) : s.calendar.connected ? (
          <>
            <p>
              Connected{s.calendar.email ? <> as <b>{s.calendar.email}</b></> : null}. {s.calendar.events} follow-up
              {s.calendar.events === 1 ? " is" : "s are"} on your calendar as all-day events.
            </p>
            <p className="note">
              Set or change a follow-up date on a prospect and the event updates a few seconds later. Clear the date, or mark the
              prospect Not a Fit, and the event is removed. A daily check also catches anything missed.
            </p>
            {s.calendar.error ? <p className="flag">{s.calendar.error}</p> : null}
            <div className="row">
              <button type="button" className="btn" disabled={!!busy} onClick={() => run("sync", () => calendarSync(true), (r) => `Calendar synced: ${r.saved} saved, ${r.removed} removed.`)}>
                {busy === "sync" ? "Syncing…" : "Sync now"}
              </button>
              <button type="button" className="btn ghost" disabled={!!busy} onClick={() => run("off", calendarDisconnect, "Disconnected. Prospect Desk's events were removed from your calendar.").then((r) => { if (r) setCalendarOn(false); })}>
                {busy === "off" ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </>
        ) : (
          <>
            {s.calendar.error ? <p className="flag">{s.calendar.error}</p> : null}
            <p>Put your follow-up dates on Google Calendar{due ? ` (${due} right now)` : ""}, with the next step and a link back to the prospect.</p>
            <p className="note">Google will ask to let Prospect Desk see and edit events on your calendar. It only adds, changes and removes its own follow-up events.</p>
            <div className="row">
              <button type="button" className="btn primary" disabled={!!busy} onClick={connect}>
                {busy === "connect" ? "Opening Google…" : "Connect Google Calendar"}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
