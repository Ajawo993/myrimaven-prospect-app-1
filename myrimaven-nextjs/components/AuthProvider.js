"use client";

/* Who is signed in, and the gate that sends signed-out visitors to /login.
   When Supabase isn't set up, status is "disabled" and every screen stays open. */

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const AuthContext = createContext({ status: "disabled", user: null, configured: false, signOut: async () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ status: supabase ? "loading" : "disabled", user: null });

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const apply = (session) => {
      if (alive) setState({ status: session ? "signedIn" : "signedOut", user: session ? session.user : null });
    };
    supabase.auth.getSession().then(({ data }) => apply(data ? data.session : null)).catch(() => apply(null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    return () => {
      alive = false;
      if (data && data.subscription) data.subscription.unsubscribe();
    };
  }, []);

  const value = {
    ...state,
    configured: !!supabase,
    signOut: async () => { if (supabase) await supabase.auth.signOut(); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* Wraps every screen. Signed-out visitors go to /login, then come back where they were. */
export function AuthGate({ children }) {
  const { status } = useAuth();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (status === "signedOut" && !isLogin) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, isLogin, pathname, router]);

  if (isLogin || status === "disabled" || status === "signedIn") return children;
  return <p className="muted">{status === "loading" ? "Checking your sign-in…" : "Taking you to sign in…"}</p>;
}
