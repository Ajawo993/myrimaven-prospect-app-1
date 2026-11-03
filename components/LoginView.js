"use client";

/* /login — sign in with Google or GitHub, or with an email and password.
   Each provider button appears once that provider is switched on in Supabase.
   Also: create an account, and email a sign-in link if the password is forgotten. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { supabase, supabaseConfigProblem, enabledProviders } from "@/lib/supabase";

/* Only send people back to a page inside this app */
function nextPath() {
  if (typeof window === "undefined") return "/discover";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/discover";
}

const PROVIDERS = [
  { id: "google", name: "Google" },
  { id: "github", name: "GitHub" },
];

function ProviderIcon({ id }) {
  if (id === "google") {
    return (
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function friendly(error, providerName) {
  const m = String((error && error.message) || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match. Try again, or email yourself a sign-in link.";
  if (m.includes("email not confirmed")) return "Confirm your email first. Open the confirmation link we sent you, then sign in.";
  if (m.includes("rate limit") || (error && error.status === 429)) return "Too many attempts. Wait a minute, then try again.";
  if (m.includes("password") && m.includes("character")) return "Use a password with at least 8 characters.";
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return `${providerName || "That"} sign-in isn't turned on in Supabase yet.`;
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
  const [busy, setBusy] = useState(""); // "" | "email" | a provider id
  const [enabled, setEnabled] = useState(null); // which providers Supabase has switched on; null = unknown
  const [msg, setMsg] = useState({ kind: "", text: "" });

  useEffect(() => {
    if (status === "signedIn") router.replace(nextPath());
  }, [status, router]);

  useEffect(() => {
    let alive = true;
    enabledProviders().then((e) => { if (alive) setEnabled(e); });
    return () => { alive = false; };
  }, []);

  function switchMode(m) {
    setMode(m);
    setMsg({ kind: "", text: "" });
  }

  async function onProvider(p) {
    if (!supabase) return;
    setBusy(p.id);
    setMsg({ kind: "", text: "" });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: p.id,
      options: { redirectTo: `${window.location.origin}/login?next=${encodeURIComponent(nextPath())}` },
    });
    if (error) {
      setBusy("");
      setMsg({ kind: "err", text: friendly(error, p.name) });
    }
    /* On success the browser leaves for the provider, then returns to /login signed in. */
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
  const providers = enabled ? PROVIDERS.filter((p) => enabled[p.id]) : PROVIDERS;

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

        {mode !== "link" && providers.length ? (
          <>
            <div className="providers">
              {providers.map((p) => (
                <button key={p.id} type="button" className={`btn block provider provider-${p.id}`} onClick={() => onProvider(p)} disabled={disabled}>
                  <ProviderIcon id={p.id} />
                  {busy === p.id ? <span className="dots">Opening {p.name}</span> : <span>Continue with {p.name}</span>}
                </button>
              ))}
            </div>
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
