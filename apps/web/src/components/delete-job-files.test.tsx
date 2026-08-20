// @vitest-environment jsdom
/**
 * DeleteJobFiles — the confirm gate is the part with teeth: this button
 * irreversibly deletes paid-for files, so "confirm declined ⇒ no request" is
 * the assertion that matters most. Mounted with react-dom/client's createRoot
 * and driven with plain dispatchEvent, same discipline as job-wizard.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as React from 'react';

// tsconfig has jsx:"preserve", so vitest compiles components to the CLASSIC
// runtime (bare `React.createElement`) — the binding below is what puts React
// in scope for them. Every sibling component test carries the same line.
// `as unknown as` is load-bearing, not noise: the direct cast is only legal when
// the resolved React types happen to overlap with globalThis, and CI resolves
// `types-react@19.0.0-rc.1` where they do not (TS2352). Found 2026-08-20 when a
// docs-only commit failed CI while the code commit before it passed — the
// difference was a warm dependency cache, not the code.
(globalThis as unknown as { React?: typeof React }).React = React;

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { DeleteJobFiles } from './delete-job-files';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const confirmMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('confirm', confirmMock);
  confirmMock.mockReturnValue(true);
  fetchMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function mount() {
  act(() => {
    root.render(<DeleteJobFiles jobId="job1" />);
  });
}

function clickDelete() {
  const button = container.querySelector('button');
  if (!button) throw new Error('button not rendered');
  return act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('DeleteJobFiles', () => {
  it('1. confirm declined ⇒ NO request is sent', async () => {
    confirmMock.mockReturnValue(false);
    mount();

    await clickDelete();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('2. confirm accepted ⇒ DELETE /api/jobs/:id, then router.refresh()', async () => {
    mount();

    await clickDelete();

    expect(fetchMock).toHaveBeenCalledWith('/api/jobs/job1', { method: 'DELETE' });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('3. a non-ok response ⇒ role="alert" error, no refresh', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    mount();

    await clickDelete();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Brisanje nije uspelo');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('4. a network failure ⇒ same error path, no refresh, button re-enabled', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    mount();

    await clickDelete();

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(container.querySelector('button')?.disabled).toBe(false);
  });
});
