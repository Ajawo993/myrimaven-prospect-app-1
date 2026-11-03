"use client";

/* Top bar: the name, the three views, and one account button.
   Who's signed in, where data is saved, light/dark mode and Sign out live in the account menu. */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useProspects } from "./ProspectsProvider";
import { useAuth } from "./AuthProvider";
import ThemeToggle from "./ThemeToggle";

const TABS = [["discover", "Discover"], ["prospects", "Prospects"], ["learnings", "Learnings"]];
const STORE_LABEL = { loading: "Connecting…", cloud: "Saved to your account", local: "Saved in this browser", memory: "Not saving right now" };

function AccountMenu({ user, mode, onSignOut }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const email = user ? user.email || "Signed in" : "";
  const initial = email ? email.trim()[0].toUpperCase() : "";

  return (
    <div className="account" ref={wrap}>
      <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        aria-label={user ? `Account menu for ${email}` : "Menu"} title={email || "Menu"}>
        {initial || (
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
          </svg>
        )}
        {mode === "memory" ? <i className="avatar-warn" aria-hidden="true"></i> : null}
      </button>
      {open ? (
        <div className="menu" role="menu">
          <div className="menu-head">
            <b>{user ? email : "Not signed in"}</b>
            <span className={"store " + mode}><i></i>{STORE_LABEL[mode]}</span>
          </div>
          <ThemeToggle variant="menu" />
          {user ? (
            <button type="button" role="menuitem" className="menu-item" onClick={onSignOut}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              <span>Sign out</span>
            </button>
          ) : (
            <Link role="menuitem" className="menu-item" href="/login">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
              </svg>
              <span>Sign in</span>
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function Header() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const { list, mode } = useProspects();
  const { status, user, signOut } = useAuth();
  const n = list.length;
  const onLogin = pathname === "/login";
  const showNav = !onLogin && (status === "disabled" || status === "signedIn");

  async function onSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <header className="bar">
      <div className="bar-in">
        <Link href="/discover" className="brand" style={{ color: "inherit", textDecoration: "none" }}>
          <b>Myrimaven</b><span>Prospect Desk</span>
        </Link>
        {showNav ? (
          <>
            <nav className="tabs" aria-label="Views">
              {TABS.map(([v, label]) => (
                <Link key={v} href={"/" + v} className="tab" aria-current={pathname.startsWith("/" + v) ? "page" : undefined}>
                  {label}
                  {v === "prospects" && n ? <span className="n">{n}</span> : null}
                </Link>
              ))}
            </nav>
            <AccountMenu user={status === "signedIn" ? user : null} mode={mode} onSignOut={onSignOut} />
          </>
        ) : (
          <ThemeToggle />
        )}
      </div>
    </header>
  );
}
