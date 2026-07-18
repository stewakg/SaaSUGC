/**
 * Browser-safe Supabase client (@supabase/ssr). Import only from client components —
 * this file must never import `next/headers` or other server-only APIs, since bundling
 * pulls the whole module into the client bundle.
 */
import { createBrowserClient as ssrBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Client component Supabase client. */
export function createBrowserClient() {
  return ssrBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
