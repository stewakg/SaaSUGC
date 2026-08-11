/**
 * Tests for admin identification.
 *
 * Small surface, outsized consequence: an admin can mint credits out of
 * nothing through `GET /api/dev/credits/add`. The failure mode worth guarding
 * is not "an admin was not recognised" — it is "someone was recognised who
 * should not have been", so most of these are about NOT matching.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { isAdminEmail } from './admin.ts';

const original = process.env.ADMIN_EMAILS;
afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = original;
});

function withList(value: string | undefined) {
  if (value === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = value;
}

describe('an empty or absent list means nobody', () => {
  it.each([undefined, '', '   ', ',', ' , , '])('treats %s as no admins', (list) => {
    withList(list);
    // The dangerous bug would be an empty list meaning "everyone".
    expect(isAdminEmail('anyone@example.com')).toBe(false);
  });
});

describe('matching', () => {
  it('matches a single listed address', () => {
    withList('owner@example.com');
    expect(isAdminEmail('owner@example.com')).toBe(true);
  });

  it('matches any entry in a comma-separated list, ignoring spacing', () => {
    withList(' first@example.com ,second@example.com,  third@example.com ');
    expect(isAdminEmail('first@example.com')).toBe(true);
    expect(isAdminEmail('second@example.com')).toBe(true);
    expect(isAdminEmail('third@example.com')).toBe(true);
  });

  it('is case-insensitive on both sides', () => {
    withList('Owner@Example.COM');
    expect(isAdminEmail('owner@example.com')).toBe(true);
    expect(isAdminEmail('OWNER@EXAMPLE.COM')).toBe(true);
  });

  it('tolerates surrounding whitespace on the address it is given', () => {
    withList('owner@example.com');
    expect(isAdminEmail('  owner@example.com  ')).toBe(true);
  });
});

describe('non-matching — the cases that would grant free credits', () => {
  it.each([null, undefined, ''])('rejects %s', (email) => {
    withList('owner@example.com');
    expect(isAdminEmail(email)).toBe(false);
  });

  it('does not match a substring or a lookalike domain', () => {
    withList('owner@example.com');
    expect(isAdminEmail('owner@example.com.attacker.net')).toBe(false);
    expect(isAdminEmail('notowner@example.com')).toBe(false);
    expect(isAdminEmail('owner@example.co')).toBe(false);
    expect(isAdminEmail('owner@exampleXcom')).toBe(false);
  });

  it('does not match an address that merely contains a listed one', () => {
    withList('a@b.com');
    expect(isAdminEmail('xa@b.com')).toBe(false);
    expect(isAdminEmail('a@b.comx')).toBe(false);
  });
});
