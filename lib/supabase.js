/* The browser's Supabase client, used for sign-in.
   It's null until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   are set in Vercel, and the app stays open without sign-in until then. */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

/* The signed-in person's token, sent with API requests so the server can check it */
export async function accessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data && data.session ? data.session.access_token : null;
}
