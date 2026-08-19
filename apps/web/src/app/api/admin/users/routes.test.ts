/**
 * Unit tests for the admin panel API:
 *   GET    /api/admin/users        — list every account
 *   POST   /api/admin/users        — manual credit adjustment
 *   DELETE /api/admin/users/[id]   — manual account deletion
 *
 * The admin gate is exercised through the REAL isAdminEmail (env-stubbed), not
 * a mock — the gate IS the feature. The deletion ordering pinned here mirrors
 * DELETE /api/jobs/[id]: storage objects before the account, so a storage
 * failure leaves a retryable state instead of stranded objects.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  getUser,
  profilesOrder,
  profilesMaybeSingle,
  jobsLimit,
  assetsEq,
  rpcMock,
  deleteUserMock,
  storageDelete,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  profilesOrder: vi.fn(),
  profilesMaybeSingle: vi.fn(),
  jobsLimit: vi.fn(),
  assetsEq: vi.fn(),
  rpcMock: vi.fn(),
  deleteUserMock: vi.fn(),
  storageDelete: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser } }),
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (_c: string) => ({
            order: profilesOrder,
            eq: (_k: string, _v: unknown) => ({ maybeSingle: profilesMaybeSingle }),
          }),
        };
      }
      if (table === 'jobs') {
        return {
          select: (_c: string) => ({
            eq: (_k: string, _v: unknown) => ({
              in: (_col: string, _vals: unknown) => ({ limit: jobsLimit }),
            }),
          }),
        };
      }
      return { select: (_c: string) => ({ eq: assetsEq }) };
    },
    rpc: rpcMock,
    auth: { admin: { deleteUser: deleteUserMock } },
  }),
}));

vi.mock('@adgen/core', async (importActual) => {
  const actual = await importActual<typeof import('@adgen/core')>();
  return { ...actual, createProviders: () => ({ storage: { delete: storageDelete } }) };
});

import { GET as listUsers, POST as adjustCredits } from './route.ts';
import { DELETE as deleteUser } from './[id]/route.ts';

function post(body: unknown) {
  return adjustCredits(
    new Request('https://app.example/api/admin/users', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as unknown as Parameters<typeof adjustCredits>[0],
  );
}

function del(id: string) {
  const request = new Request(`https://app.example/api/admin/users/${id}`, {
    method: 'DELETE',
  }) as unknown as Parameters<typeof deleteUser>[0];
  return deleteUser(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
  getUser.mockResolvedValue({ data: { user: { id: 'admin1', email: 'admin@example.com' } } });
  profilesOrder.mockResolvedValue({
    data: [{ id: 'u1', email: 'kupac@example.com', balance: 40, created_at: '2026-08-01' }],
    error: null,
  });
  profilesMaybeSingle.mockResolvedValue({ data: { id: 'u1' } });
  jobsLimit.mockResolvedValue({ data: [] });
  assetsEq.mockResolvedValue({
    data: [{ storage_key: 'renders/a.mp4' }, { storage_key: 'renders/b.mp4' }],
  });
  rpcMock.mockResolvedValue({ data: 65, error: null });
  deleteUserMock.mockResolvedValue({ error: null });
  storageDelete.mockResolvedValue(undefined);
});

describe('GET /api/admin/users', () => {
  it('1. unauthenticated ⇒ 401', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await listUsers();

    expect(res.status).toBe(401);
    expect(profilesOrder).not.toHaveBeenCalled();
  });

  it('2. a signed-in NON-admin ⇒ 404 not_available (route hides itself)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'kupac@example.com' } } });

    const res = await listUsers();

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_available' });
    expect(profilesOrder).not.toHaveBeenCalled();
  });

  it('3. admin ⇒ 200 with the account list', async () => {
    const res = await listUsers();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      users: [{ id: 'u1', email: 'kupac@example.com', balance: 40, created_at: '2026-08-01' }],
    });
  });

  it('4. an empty ADMIN_EMAILS list ⇒ 404 even for the listed admin (nobody is admin)', async () => {
    vi.stubEnv('ADMIN_EMAILS', '');

    const res = await listUsers();

    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/users — manual credit adjustment', () => {
  it('5. non-admin ⇒ 404, RPC not called', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'kupac@example.com' } } });

    const res = await post({ userId: 'u1', delta: 10 });

    expect(res.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('6. malformed JSON ⇒ 400 invalid_body', async () => {
    const res = await post('{nije json');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
  });

  it('7. zero, fractional, oversized and missing-user deltas are ALL refused', async () => {
    for (const body of [
      { userId: 'u1', delta: 0 },
      { userId: 'u1', delta: 1.5 },
      { userId: 'u1', delta: 100_001 },
      { userId: 'u1', delta: -100_001 },
      { userId: 'u1', delta: '10' },
      { delta: 10 },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_adjustment' });
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('8. a positive adjustment ⇒ add_credits with reason admin_adjust, new balance returned', async () => {
    const res = await post({ userId: 'u1', delta: 25 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ balance: 65 });
    expect(rpcMock).toHaveBeenCalledWith('add_credits', {
      p_user_id: 'u1',
      p_amount: 25,
      p_reason: 'admin_adjust',
    });
  });

  it('9. a NEGATIVE adjustment is allowed — that is the "oduzmi" half', async () => {
    const res = await post({ userId: 'u1', delta: -10 });

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('add_credits', {
      p_user_id: 'u1',
      p_amount: -10,
      p_reason: 'admin_adjust',
    });
  });

  it('10. an RPC failure ⇒ 500 adjust_failed, no Postgres detail in the body', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'db exploded' } });

    const res = await post({ userId: 'u1', delta: 10 });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'adjust_failed' });
  });
});

describe('DELETE /api/admin/users/[id]', () => {
  it('11. unauthenticated ⇒ 401; non-admin ⇒ 404 — nothing touched', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await del('u1')).status).toBe(401);

    getUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'kupac@example.com' } } });
    expect((await del('u1')).status).toBe(404);

    expect(storageDelete).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('12. deleting YOURSELF is refused ⇒ 400 cannot_delete_self', async () => {
    const res = await del('admin1');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'cannot_delete_self' });
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('13. an unknown account ⇒ 404 not_found', async () => {
    profilesMaybeSingle.mockResolvedValue({ data: null });

    const res = await del('ghost');

    expect(res.status).toBe(404);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('14. queued/running jobs ⇒ 409 jobs_in_flight, account survives', async () => {
    jobsLimit.mockResolvedValue({ data: [{ id: 'j1' }] });

    const res = await del('u1');

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'jobs_in_flight' });
    expect(storageDelete).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('15. happy path ⇒ every storage object deleted, THEN the auth user', async () => {
    const res = await del('u1');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, files: 2 });
    expect(storageDelete.mock.calls.map((c) => c[0])).toEqual(['renders/a.mp4', 'renders/b.mp4']);
    expect(deleteUserMock).toHaveBeenCalledWith('u1');
    // Ordering: the last storage delete happens BEFORE the auth deletion.
    expect(storageDelete.mock.invocationCallOrder[1]).toBeLessThan(
      deleteUserMock.mock.invocationCallOrder[0],
    );
  });

  it('16. a storage failure ⇒ 502 and the ACCOUNT SURVIVES (retry stays possible)', async () => {
    storageDelete.mockRejectedValueOnce(new Error('r2 down'));

    const res = await del('u1');

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('17. an auth-deletion failure ⇒ 500 delete_failed', async () => {
    deleteUserMock.mockResolvedValue({ error: { message: 'auth exploded' } });

    const res = await del('u1');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
  });
});
