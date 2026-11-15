"use client";

/* First-visit choice: keep the 40 sample prospects to explore, or start with a blank list.
   Shown once per account (the choice is saved on the account, so it follows them to other devices),
   and only while every prospect in the account is a sample. Either way can be undone on the Prospects page. */

import { useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { useProspects } from "./ProspectsProvider";

export default function Welcome() {
  const pathname = usePathname() || "";
  const { status, user } = useAuth();
  const { list, mode, removeSample, toast } = useProspects();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState("");

  const chosen = user && user.user_metadata && user.user_metadata.setup_choice;
  const samples = list.filter((p) => p.id.startsWith("sp-")).length;
  const allSamples = samples > 0 && samples === list.length;
  if (hidden || pathname === "/login" || status !== "signedIn" || mode !== "cloud" || chosen || !allSamples) return null;

  async function remember(choice) {
    try { await supabase.auth.updateUser({ data: { setup_choice: choice } }); } catch { /* still hidden for this visit */ }
  }

  async function explore() {
    setBusy("sample");
    await remember("sample");
    setHidden(true);
  }

  async function blank() {
    setBusy("blank");
    await removeSample();
    await remember("blank");
    setHidden(true);
    toast("You're starting with a blank list. Find organizations on Discover, or load the samples later from Prospects.");
  }

  return (
    <section className="panel welcome" aria-labelledby="welcome-title">
      <div>
        <p className="eyebrow">Welcome</p>
        <h2 id="welcome-title">How would you like to start?</h2>
        <p className="note">
          Your account comes with {samples} fictional sample prospects, so you can see how contacts, outreach and Learnings fit
          together. You can switch later from the Prospects page.
        </p>
      </div>
      <div className="row">
        <button className="btn primary" disabled={!!busy} onClick={explore}>
          {busy === "sample" ? <span className="dots">Saving</span> : "Explore with sample data"}
        </button>
        <button className="btn" disabled={!!busy} onClick={blank}>
          {busy === "blank" ? <span className="dots">Clearing</span> : "Start blank"}
        </button>
      </div>
    </section>
  );
}
