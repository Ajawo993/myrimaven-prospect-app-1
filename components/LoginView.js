"use client";

/* /login — sign in with Google, or with an email and password.
   Also: create an account, and email a sign-in link if the password is forgotten. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { supabase, supabaseConfigProblem } from "@/lib/supabase";

/* Only send people back to a page inside this app */
function nextPath() {
  if (typeof window === "undefined") return "/discover";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/discover";
}

function friendly(error) {
  const m = String((error && error.message) || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match. Try again, or email yourself a sign-in link.";
  if (m.includes("email not confirmed")) return "Confirm your email first. Open the confirmation link we sent you, then sign in.";
  if (m.includes("rate limit") || (error && error.status === 429)) return "Too many attempts. Wait a minute, then try again.";
  if (m.includes("password") && m.includes("character")) return "Use a password with at least 8 characters.";
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return "Google sign-in isn't turned on in Supabase yet.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "New accounts are turned off for this app.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) return "Couldn't reach Supabase. Check that NEXT_PUBLIC_SUPABASE_URL in Vercel is your Project URL, then redeploy.";
  if (m.includes("did not match the expected pattern") || m.includes("invalid header") || m.includes("invalid api key")) {
    return "Supabase rejected the app's settings. In Vercel, re-enter NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY with no spaces or quotes, then redeploy.";
  }
  return (error && error.message) || "Something went wrong. Try again.";
}

const TITLES = {
  signin: "Sign in",
  signup: "Create an account",
  link: "Email me a sign-in link",
};

export default function LoginView() {
  const router = useRouter();
  const { status, configured } = useAuth();
  const [mode, setMode] = useState("signin"); // signin | signup | link
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(""); // "" | "google" | "email"
  const [msg, setMsg] = useState({ kind: "", text: "" });

  useEffect(() => {
    if (status === "signedIn") router.replace(nextPath());
  }, [status, router]);

  function switchMode(m) {
    setMode(m);
    setMsg({ kind: "", text: "" });
  }

  async function onGoogle() {
    if (!supabase) return;
    setBusy("google");
    setMsg({ kind: "", text: "" });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login?next=${encodeURIComponent(nextPath())}` },
    });
    if (error) {
      setBusy("");
      setMsg({ kind: "err", text: friendly(error) });
    }
    /* On success the browser leaves for Google, then returns to /login signed in. */
  }

  async function onEmail(e) {
    e.preventDefault();
    if (!supabase) return;
    const addr = email.trim();
    if (!addr) { setMsg({ kind: "err", text: "Enter your email address." }); return; }
    if (mode !== "link" && password.length < 8) { setMsg({ kind: "err", text: "Use a password with at least 8 characters." }); return; }
    setBusy("email");
    setMsg({ kind: "", text: "" });
    const back = `${window.location.origin}/login?next=${encodeURIComponent(nextPath())}`;
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: addr, password });
        if (error) setMsg({ kind: "err", text: friendly(error) });
        /* On success, the signed-in effect above moves on to the app. */
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: addr, password, options: { emailRedirectTo: back } });
        if (error) setMsg({ kind: "err", text: friendly(error) });
        else if (!data || !data.session) {
          setMsg({ kind: "ok", text: `Check your email. We sent a confirmation link to ${addr}. Open it to finish creating your account.` });
          setPassword("");
        }
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: back, shouldCreateUser: false } });
        if (error && !String(error.message || "").toLowerCase().includes("signups not allowed")) setMsg({ kind: "err", text: friendly(error) });
        else setMsg({ kind: "ok", text: `If ${addr} has an account, a sign-in link is on its way. Open it on this device.` });
      }
    } catch (err) {
      setMsg({ kind: "err", text: friendly(err) });
    }
    setBusy("");
  }

  const disabled = !configured || !!busy || status === "signedIn";

  return (
    <div className="auth-wrap">
      <section className="auth-intro">
        <p className="eyebrow">Myrimaven Prospect Desk</p>
        <h1>Sign in to pick up where you left off</h1>
        <p className="lede">Find organizations with a real reason to talk to Myrimaven, qualify them, and keep what every conversation teaches you in one place.</p>
        <ol className="steps">
          <li><b>Find</b> an organization showing a signal</li>
          <li><b>Qualify</b> the problem and the right contact</li>
          <li><b>Contact and learn</b>, even from a no</li>
        </ol>
      </section>

      <section className="panel auth-card" aria-labelledby="auth-title">
        <h2 id="auth-title">{TITLES[mode]}</h2>

        {!configured && supabaseConfigProblem ? (
          <div className="auth-msg err" role="alert">
            Sign-in is set up incorrectly in Vercel: {supabaseConfigProblem} Fix it under Settings → Environment Variables, then redeploy.
          </div>
        ) : null}

        {!configured && !supabaseConfigProblem ? (
          <div className="auth-msg warn">
            Sign-in isn&apos;t connected yet. It turns on once Supabase is set up for this app.{" "}
            <Link href="/discover">Continue without signing in</Link>
          </div>
        ) : null}

        {mode !== "link" ? (
          <>
            <button type="button" className="btn block" onClick={onGoogle} disabled={disabled}>
              {busy === "google" ? <span className="dots">Opening Google</span> : "Continue with Google"}
            </button>
            <div className="divider" role="separator"><span>or use your email</span></div>
          </>
        ) : null}

        <form className="stack" onSubmit={onEmail} noValidate>
          <label className="f">Email
            <input type="email" id="auth-email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </label>
          {mode !== "link" ? (
            <label className="f">Password
              <input
                type="password"
                id="auth-password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : ""}
                required
              />
            </label>
          ) : (
            <p className="note">We&apos;ll email you a link that signs you in. No password needed.</p>
          )}
          <button className="btn primary block" disabled={disabled}>
            {busy === "email" ? <span className="dots">Working</span> : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Email me a link"}
          </button>
        </form>

        {msg.text ? <p className={`auth-msg ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>{msg.text}</p> : null}

        <div className="auth-links">
          {mode === "signin" ? (
            <>
              <button type="button" className="btn ghost small" onClick={() => switchMode("link")}>Forgot your password? Email me a sign-in link</button>
              <span>New here? <button type="button" className="btn ghost small" onClick={() => switchMode("signup")}>Create an account</button></span>
            </>
          ) : (
            <span>
              {mode === "signup" ? "Already have an account?" : "Remembered it?"}{" "}
              <button type="button" className="btn ghost small" onClick={() => switchMode("signin")}>Sign in</button>
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
