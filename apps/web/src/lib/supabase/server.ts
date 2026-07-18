/**
 * Server-only Supabase clients (@supabase/ssr). Never import from a "use client" file —
 * pulls in `next/headers`, which breaks the client bundle.
 *
 * - createServerClient: server components / route handlers (RLS-enforced, reads the
 *                        user's session from cookies()).
 * - createAdminClient:  service-role, bypasses RLS. Route handlers that need to write
 *                        jobs/assets for a user.
 */
import { cookies } from 'next/headers';
import { createServerClient as ssrServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { createServiceClient } from '@adgen/db';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

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
