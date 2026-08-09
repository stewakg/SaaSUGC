'use client';

import { PASSWORD_RULES } from '@/lib/password';

/**
 * Live checklist under a password field. Shown from the first keystroke and
 * hidden while the field is empty, so a first-time visitor sees the rules as
 * guidance rather than as a wall of red before typing anything.
 */
export function PasswordRules({ value }: { value: string }) {
  if (!value) return null;

  return (
    <ul className="space-y-1 text-xs" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.ok(value);
        return (
          <li key={rule.label} className={ok ? 'text-emerald-400' : 'text-zinc-500'}>
            <span aria-hidden="true">{ok ? '✓' : '○'}</span>{' '}
            <span>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
