'use client';

import { PASSWORD_RULES } from '@/lib/password';

/**
 * Live checklist under a password field. Always visible, including on an empty
 * field: the rules have to be readable BEFORE the user starts typing, or they
 * find out what was required only after guessing wrong. Unmet rules are muted
 * grey rather than red, so an untouched form reads as instructions and not as
 * errors.
 */
export function PasswordRules({ value }: { value: string }) {
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
