/**
 * Unit tests for DELETE /api/jobs/[id] — the "Obriši fajlove" action.
 * (GET on this route is covered in ../remaining-routes.test.ts.)
 *
 * The order pinned here is the one with money and data attached: storage
 * objects are deleted BEFORE the rows that carry their keys, so a mid-flight
 * failure leaves a retryable state instead of stranding unreachable objects
 * in the bucket. The route module under test is READ-ONLY — a failing test is
 * a finding to report, not a reason to edit the route.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  getUser,
  jobsSingle,
  assetsEq,
  storageDelete,
  adminAssetsDeleteEq,
  adminJobsUpdate,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  jobsSingle: vi.fn(),
  assetsEq: vi.fn(),
  storageDelete: vi.fn(),
  adminAssetsDeleteEq: vi.fn(),
  adminJobsUpdate: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  // RLS-scoped client: jobs chains .select().eq().single(); assets chains
  // .select().eq() and resolves the row list directly.
  createServerClient: async () => ({
    auth: { getUser },
    from: (table: string) =>
      table === 'jobs'
        ? { select: (_c: string) => ({ eq: (_k: string, _v: unknown) => ({ single: jobsSingle }) }) }
        : { select: (_c: string) => ({ eq: assetsEq }) },
  }),
  // Service-role client: assets .delete().eq(), jobs .update(payload).eq().
  // adminJobsUpdate records the PAYLOAD so tests can pin the patched result.
  createAdminClient: () => ({
    from: (table: string) =>
      table === 'assets'
        ? { delete: () => ({ eq: adminAssetsDeleteEq }) }
        : { update: (payload: unknown) => ({ eq: (_k: string, _v: unknown) => adminJobsUpdate(payload) }) },
  }),
}));

// Only createProviders is overridden; everything else stays real (same
// discipline as remaining-routes.test.ts).
vi.mock('@adgen/core', async (importActual) => {
  const actual = await importActual<typeof import('@adgen/core')>();
  return { ...actual, createProviders: () => ({ storage: { delete: storageDelete } }) };
});

import { DELETE as deleteJobFiles } from './route.ts';

function del(id: string) {
  const request = new Request(`https://app.example/api/jobs/${id}`, {
    method: 'DELETE',
  }) as unknown as Parameters<typeof deleteJobFiles>[0];
  return deleteJobFiles(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  jobsSingle.mockResolvedValue({
    data: { id: 'job1', status: 'done', result: { assets: [{ kind: 'video', url: '/api/storage/renders/a.mp4' }], note: 'kept' } },
    error: null,
  });
  assetsEq.mockResolvedValue({
    data: [
      { id: 'a1', storage_key: 'renders/a.mp4' },
      { id: 'a2', storage_key: 'renders/b.mp4' },
    ],
  });
  storageDelete.mockResolvedValue(undefined);
  adminAssetsDeleteEq.mockResolvedValue({ error: null });
  adminJobsUpdate.mockResolvedValue({ error: null });
});

describe('DELETE /api/jobs/[id]', () => {
  it('1. unauthenticated ⇒ 401, nothing touched', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await del('job1');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
    expect(storageDelete).not.toHaveBeenCalled();
    expect(adminAssetsDeleteEq).not.toHaveBeenCalled();
  });

  it('2. a job id that returns no row ⇒ 404 (RLS cross-customer), nothing touched', async () => {
    jobsSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const res = await del('someone-elses-job');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
    expect(storageDelete).not.toHaveBeenCalled();
    expect(adminAssetsDeleteEq).not.toHaveBeenCalled();
  });

  it('3. running job ⇒ 409 job_in_flight, nothing touched', async () => {
    jobsSingle.mockResolvedValue({ data: { id: 'job1', status: 'running', result: null }, error: null });

    const res = await del('job1');

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'job_in_flight' });
    expect(storageDelete).not.toHaveBeenCalled();
    expect(adminAssetsDeleteEq).not.toHaveBeenCalled();
  });

  it('4. queued job ⇒ 409 job_in_flight', async () => {
    jobsSingle.mockResolvedValue({ data: { id: 'job1', status: 'queued', result: null }, error: null });

    const res = await del('job1');

    expect(res.status).toBe(409);
    expect(storageDelete).not.toHaveBeenCalled();
  });

  it('5. happy path ⇒ deletes both objects, then the rows, then patches result', async () => {
    const res = await del('job1');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 });
    expect(storageDelete.mock.calls.map((c) => c[0])).toEqual(['renders/a.mp4', 'renders/b.mp4']);
    expect(adminAssetsDeleteEq).toHaveBeenCalledTimes(1);
    // The patch empties assets, sets the marker, and PRESERVES other fields.
    expect(adminJobsUpdate).toHaveBeenCalledWith({
      result: { assets: [], files_deleted: true, note: 'kept' },
    });
  });

  it('6. a storage delete failure ⇒ 502 and the rows SURVIVE (retry stays possible)', async () => {
    storageDelete.mockRejectedValueOnce(new Error('r2 down'));

    const res = await del('job1');

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
    // Rows keep the keys — deleting them here would strand the objects forever.
    expect(adminAssetsDeleteEq).not.toHaveBeenCalled();
    expect(adminJobsUpdate).not.toHaveBeenCalled();
  });

  it('7. a null storage_key row is skipped in storage but still removed from the DB', async () => {
    assetsEq.mockResolvedValue({
      data: [
        { id: 'a1', storage_key: null },
        { id: 'a2', storage_key: 'renders/b.mp4' },
      ],
    });

    const res = await del('job1');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1 });
    expect(storageDelete).toHaveBeenCalledTimes(1);
    expect(storageDelete).toHaveBeenCalledWith('renders/b.mp4');
    expect(adminAssetsDeleteEq).toHaveBeenCalledTimes(1);
  });

  it('8. an error-status job with null result ⇒ rows removed, result NOT patched', async () => {
    jobsSingle.mockResolvedValue({ data: { id: 'job1', status: 'error', result: null }, error: null });
    assetsEq.mockResolvedValue({ data: [] });

    const res = await del('job1');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 0 });
    expect(adminAssetsDeleteEq).toHaveBeenCalledTimes(1);
    expect(adminJobsUpdate).not.toHaveBeenCalled();
  });

  it('9. an asset-row delete failure ⇒ 500 delete_failed, result NOT patched', async () => {
    adminAssetsDeleteEq.mockResolvedValue({ error: { message: 'db exploded' } });

    const res = await del('job1');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
    expect(adminJobsUpdate).not.toHaveBeenCalled();
  });
});
