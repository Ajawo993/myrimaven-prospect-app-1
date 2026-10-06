"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useProspects } from "./ProspectsProvider";
import { useAuth } from "./AuthProvider";

const TABS = [["discover", "Discover"], ["prospects", "Prospects"], ["learnings", "Learnings"]];
const STORE_LABEL = { loading: "Connecting…", local: "Saved in this browser", memory: "This visit only" };

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
            <div className={"store " + mode}><i></i><span>{STORE_LABEL[mode]}</span></div>
            {status === "signedIn" && user ? (
              <div className="who">
                <span className="who-email" title={user.email || ""}>{user.email || "Signed in"}</span>
                <button className="btn ghost small" onClick={onSignOut}>Sign out</button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </header>
  );
}
