/**
 * Typed Supabase client factory + helpers.
 *
 * Three flavours:
 *   - createBrowserClient: anon key, uses the user's session (RLS-enforced).
 *   - createServerClient:  anon key on the server, with the user's access token
 *                          injected via @supabase/ssr (RLS-enforced).
 *   - createServiceClient: SERVICE-ROLE key, BYPASSES RLS. Worker / server
 *                          internals only — NEVER import in a client component.
 *
 * Security: the service-role key must never reach the browser bundle.
 */
import { createClient as supabaseCreateClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types.ts';

export type { Database } from './generated/database.types.ts';
export type { JobType, JobStatus, AssetKind } from './generated/database.types.ts';

const DEFAULT_LOCAL_URL = 'http://127.0.0.1:54321';

function resolveUrl(url?: string): string {
  return url && url.length > 0 ? url : DEFAULT_LOCAL_URL;
}

/** Browser/anon client (RLS applies). Pass the live session through ssr in apps/web. */
export function createBrowserClient(
  url?: string,
  anonKey?: string,
  options?: { auth?: { persistSession?: boolean } },
) {
  if (!anonKey) {
    // Fallback to a clearly-invalid sentinel so misuse fails loudly at request
    // time rather than silently building an unauthenticated client.
    return supabaseCreateClient<Database>(resolveUrl(url), 'MISSING_ANON_KEY', {
      auth: { persistSession: options?.auth?.persistSession ?? false },
    });
  }
  return supabaseCreateClient<Database>(resolveUrl(url), anonKey, {
    auth: { persistSession: options?.auth?.persistSession ?? true },
  });
}

/**
 * Service-role client — bypasses RLS. Worker & server routes only.
 * Throws if the service-role key is absent, so callers don't accidentally get
 * a no-op anon client when they think they have admin powers.
 */
export function createServiceClient(url?: string, serviceRoleKey?: string) {
  if (!serviceRoleKey) {
    throw new Error(
      'createServiceClient requires SUPABASE_SERVICE_ROLE_KEY. ' +
        'For local dev run `supabase start` and copy the key from its output.',
    );
  }
  return supabaseCreateClient<Database>(resolveUrl(url), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Convenience typed table accessor (for ad-hoc queries). */
export function table(client: ReturnType<typeof createBrowserClient | typeof createServiceClient>) {
  return client.from('jobs'); // example; callers use client.from('...') directly
}