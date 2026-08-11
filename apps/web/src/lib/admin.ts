/**
 * Who counts as an admin.
 *
 * Admin status is an ENV setting, never a hardcoded address: this repo is on
 * GitHub, and committing a personal email would publish it. Set
 * `ADMIN_EMAILS` in the root `.env` (comma-separated, case-insensitive) and
 * `pnpm env:sync` carries it into apps/web.
 *
 * Two rules that matter more than the code:
 *
 * 1. This is a SERVER-side check. Hiding a button in the UI hides nothing —
 *    the route behind it has to make the same decision, or anyone who knows
 *    the URL can call it. Every admin-only route must call this itself.
 * 2. An admin can hand themselves credits for free. That is the point, and it
 *    is also the whole risk: if an admin account is phished, the attacker
 *    mints credits rather than buying them. Keep the list to accounts that
 *    genuinely need it, and never add a customer to it "temporarily".
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** True when `email` is listed in ADMIN_EMAILS. Empty/absent list ⇒ nobody. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = adminEmails();
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}
