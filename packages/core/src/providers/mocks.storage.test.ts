/**
 * Tests for MockStorage's `delete` — the one Storage operation that removes
 * files instead of writing them.
 *
 * Real filesystem, no mocking of node:fs: the whole point is that a file
 * actually disappears (and, in the traversal case, that a file OUTSIDE the
 * storage root actually survives). Everything runs inside a throwaway temp
 * directory, one per test file, removed afterwards.
 */
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MockStorage } from './mocks.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adgen-storage-'));
// Absolute on purpose: resolveLocalStorageDir passes an absolute path straight
// through, so the mock operates exactly inside this temp directory.
const storage = new MockStorage(root);

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('MockStorage.delete', () => {
  it('removes a file that was uploaded under the key', async () => {
    const key = 'uploads/u1/a.txt';
    await storage.upload(key, Buffer.from('hello'), 'text/plain');
    const abs = path.resolve(root, key);
    expect(fs.existsSync(abs)).toBe(true);

    await storage.delete(key);

    expect(fs.existsSync(abs)).toBe(false);
  });

  it('resolves when the key was never uploaded — idempotent by contract', async () => {
    await expect(storage.delete('uploads/u1/never-there.txt')).resolves.toBeUndefined();
  });

  it('rejects a key that escapes the storage directory — and deletes nothing outside it', async () => {
    // '../escaped.txt' resolves one level ABOVE the storage root. The file is
    // created there BEFORE the call on purpose: asserting only the throw would
    // still pass if the implementation deleted the file first and threw after.
    const escapedAbs = path.resolve(root, '../escaped.txt');
    fs.writeFileSync(escapedAbs, 'must survive');
    try {
      await expect(storage.delete('../escaped.txt')).rejects.toThrow(
        'storage key escapes the storage directory',
      );
      expect(fs.existsSync(escapedAbs)).toBe(true);
    } finally {
      fs.rmSync(escapedAbs, { force: true });
    }
  });
});
