import { createClient } from "@supabase/supabase-js";

// VITE_* for local .env.local; NEXT_PUBLIC_* from the Vercel Supabase integration.
const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase URL / anon key. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (see .env.local.example), or connect the Supabase integration in Vercel."
  );
}

export const supabase = createClient(url, anonKey);
