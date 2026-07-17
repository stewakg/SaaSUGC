/**
 * Supabase clients for the Next.js App Router (@supabase/ssr).
 *
 * - createBrowserClient: client components (RLS-enforced, reads session cookie).
 * - createServerClient:  server components / route handlers (RLS-enforced,
 *                        reads the user's session from cookies()).
 * - createAdminClient:   service-role, bypasses RLS. SERVER-ONLY (route handlers
 *                        that need to write jobs/assets for a user). Never import
 *                        in a "use client" file.
 *
 * Mock-first: if the public env vars are unset (no local Supabase running yet),
 * these still construct clients pointing at the local default URL; auth calls
 * will simply fail until `supabase start` is run. The app shell still renders.
 */
import { cookies } from 'next/headers';
import { createBrowserClient as ssrBrowserClient } from '@supabase/ssr';
import { createServerClient as ssrServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { createServiceClient } from '@adgen/db';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Client component Supabase client. */
export function createBrowserClient() {
  return ssrBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Server component / route handler Supabase client (reads cookies async).
 * NOTE: Next 15 made cookies() async — we await it.
 */
export async function createServerClient() {
  const cookieStore = await cookies();
  return ssrServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — safe to ignore (middleware refreshes).
        }
      },
    },
  });
}

/** Service-role client (bypasses RLS). Server-only. */
export function createAdminClient() {
  return createServiceClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}