/**
 * Tests for the password checklist.
 *
 * This file is UX, not security — the enforceable policy lives in Supabase. It
 * matters because it has been WRONG twice, both times in the dangerous
 * direction: the checklist went all-green, the user submitted, and the server
 * rejected with an error they could not act on.
 *
 * The two historical failures are pinned as tests below, so a future edit that
 * reintroduces either one fails here instead of in front of a customer:
 *
 *   1. `Testovi!` — passed when the file checked only length, capital and
 *      symbol, while Supabase also required a digit.
 *   2. `Test tes1` — passed when the checks used Unicode classes, where a SPACE
 *      counted as a symbol. GoTrue uses literal ASCII sets, and it does not.
 */
import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES } from './password.ts';

const allPass = (pw: string) => PASSWORD_RULES.every((r) => r.ok(pw));
const failing = (pw: string) => PASSWORD_RULES.filter((r) => !r.ok(pw)).map((r) => r.label);

describe('the two passwords that actually got through and should not have', () => {
  it('rejects `Testovi!` — no digit', () => {
    expect(allPass('Testovi!')).toBe(false);
    expect(failing('Testovi!')).toEqual(['Bar jedna cifra']);
  });

  it('rejects `Test tes1` — a space is not a symbol to GoTrue', () => {
    expect(allPass('Test tes1')).toBe(false);
    expect(failing('Test tes1')).toEqual(['Bar jedan specijalan znak (!?#$…)']);
  });
});

describe('ASCII only — the Serbian consequence, which is deliberate', () => {
  it('rejects `Čekaj123!`, because Č is not an ASCII capital', () => {
    // Supabase would reject it too. Saying so up front is the point of the file.
    expect(allPass('Čekaj123!')).toBe(false);
    expect(failing('Čekaj123!')).toEqual(['Bar jedno veliko slovo (A-Z)']);
  });

  it('rejects Serbian lowercase standing in for a-z', () => {
    expect(PASSWORD_RULES[1].ok('ČĆŽŠĐ')).toBe(false);
  });

  it('accepts the same password once an ASCII capital is present', () => {
    expect(allPass('CČekaj123!')).toBe(true);
  });
});

describe('each rule in isolation', () => {
  it('length is the stated minimum, not one either side', () => {
    const short = 'Aa1!'.repeat(1) + 'b'.repeat(PASSWORD_MIN_LENGTH - 5);
    expect(short.length).toBe(PASSWORD_MIN_LENGTH - 1);
    expect(PASSWORD_RULES[0].ok(short)).toBe(false);
    expect(PASSWORD_RULES[0].ok(`${short}x`)).toBe(true);
  });

  it.each([
    [1, 'lowercase', 'a', 'A'],
    [2, 'uppercase', 'A', 'a'],
    [3, 'digit', '5', 'x'],
  ])('rule %i (%s) sees the character and nothing else', (index, _name, present, absent) => {
    expect(PASSWORD_RULES[index].ok(present)).toBe(true);
    expect(PASSWORD_RULES[index].ok(absent)).toBe(false);
  });

  it.each(['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '-', '=', '[', ']', '{', '}', ';', "'", '\\', ':', '"', '|', '<', '>', '?', ',', '.', '/', '`', '~'])(
    'accepts %s as a symbol, matching GoTrue’s literal set',
    (ch) => {
      expect(PASSWORD_RULES[4].ok(ch)).toBe(true);
    },
  );

  it.each([' ', '\t', 'č', 'é', '€', '£'])('does NOT accept %s as a symbol', (ch) => {
    expect(PASSWORD_RULES[4].ok(ch)).toBe(false);
  });
});

describe('a password that satisfies everything', () => {
  it.each(['Testovi1!', 'Zdravo123#', 'aA1!aA1!'])('accepts %s', (pw) => {
    expect(allPass(pw)).toBe(true);
  });

  it('reports every failing rule at once, not just the first', () => {
    // The checklist shows all of them simultaneously; a short-circuit here
    // would make it flicker one rule at a time as the user types.
    expect(failing('abc')).toHaveLength(4);
  });
});
