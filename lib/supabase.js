/* The browser's Supabase client, used for sign-in.
   It's null until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   are set in Vercel, and the app stays open without sign-in until then. */

import { createClient } from "@supabase/supabase-js";

/* Values pasted into Vercel sometimes carry spaces, line breaks or quote marks */
export function cleanEnv(v) {
  return String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();
}

export function checkSupabaseEnv(url, key) {
  if (!url && !key) return { ok: false, problem: "" };
  if (!url) return { ok: false, problem: "NEXT_PUBLIC_SUPABASE_URL is missing." };
  if (!key) return { ok: false, problem: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing." };
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url) && !/^https?:\/\/[^\s/]+(:\d+)?\/?$/i.test(url)) {
    return { ok: false, problem: "NEXT_PUBLIC_SUPABASE_URL should be just the Project URL, like https://abcdxyz.supabase.co" };
  }
  if (/\s/.test(key) || key.startsWith("http") || key.includes("=")) {
    return { ok: false, problem: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY should be only the key itself, starting with sb_publishable_" };
  }
  if (key.startsWith("sb_secret_")) {
    return { ok: false, problem: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY has the secret key. Use the publishable key (sb_publishable_...) instead." };
  }
  return { ok: true, problem: "" };
}

const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
const key = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const check = checkSupabaseEnv(url, key);

/* Shown on the sign-in screen when the Vercel values look wrong */
export const supabaseConfigProblem = check.problem;

let client = null;
if (check.ok) {
  try {
    client = createClient(url, key);
  } catch {
    client = null;
  }
}
export const supabase = client;

/* The signed-in person's token, sent with API requests so the server can check it */
export async function accessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data && data.session ? data.session.access_token : null;
}
