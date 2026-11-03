"use client";

/* Light / dark switch. Until someone picks, the app follows the device's setting.
   The choice is remembered in this browser, and a small script in app/layout.js
   applies it before the page draws, so there's no flash.
   variant="icon": a small round button (sign-in page). variant="menu": a row in the account menu. */

import { useEffect, useState } from "react";

export const THEME_KEY = "myrimaven-theme";

function current() {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const Moon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const Sun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export default function ThemeToggle({ variant = "icon" }) {
  const [theme, setTheme] = useState(null); // null until we know, to match the server render

  useEffect(() => { setTheme(current()); }, []);

  function toggle() {
    const next = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private window: still switches for this visit */ }
    setTheme(next);
  }

  const toDark = theme !== "dark";
  const label = toDark ? "Switch to dark mode" : "Switch to light mode";

  if (variant === "menu") {
    return (
      <button type="button" role="menuitem" className="menu-item" onClick={toggle}>
        {toDark ? <Moon /> : <Sun />}
        <span>{toDark ? "Dark mode" : "Light mode"}</span>
      </button>
    );
  }
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={label} title={label}>
      {toDark ? <Moon /> : <Sun />}
    </button>
  );
}
