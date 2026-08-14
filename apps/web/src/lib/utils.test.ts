/**
 * Tests for cn — the one export of utils.ts.
 *
 * cn is twMerge(clsx(...)): clsx flattens arrays/nested args and drops falsy
 * values, tailwind-merge then resolves conflicting Tailwind classes with the
 * LAST one winning. Pure string in/string out, so the node environment fits.
 */
import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('joins plain class strings', () => {
    expect(cn('flex', 'items-center')).toBe('flex items-center');
  });

  it('drops falsy values (false, null, undefined, empty string)', () => {
    expect(cn('p-2', false, null, undefined, '', 'hidden')).toBe('p-2 hidden');
  });

  it('flattens arrays and nested arguments', () => {
    expect(cn(['a', ['b', { c: true }]], 'd')).toBe('a b c d');
  });

  it('keeps object keys whose value is truthy and drops the rest', () => {
    expect(cn({ bold: true, italic: false, underline: 1 as unknown as true })).toBe(
      'bold underline',
    );
  });

  it('lets a later Tailwind class win over an earlier conflicting one', () => {
    // tailwind-merge exists precisely for this: the last conflicting utility
    // is the one the browser applies, so 'p-4' must survive, 'p-2' must go.
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-left', 'text-center')).toBe('text-center');
  });

  it('keeps non-conflicting classes side by side', () => {
    expect(cn('p-2', 'text-sm')).toBe('p-2 text-sm');
  });

  it('returns an empty string for no input at all', () => {
    expect(cn()).toBe('');
    expect(cn(undefined, null, false)).toBe('');
  });
});
