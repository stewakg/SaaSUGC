'use client';

/**
 * „Obriši fajlove" on a „Moje reklame" row — calls DELETE /api/jobs/:id, which
 * removes the generated files from storage and the rows pointing at them.
 * Irreversible, so the click goes through window.confirm first: the row lists
 * finished ads a customer may be actively using, and one mis-tap must not cost
 * them a video they paid for.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const CONFIRM_TEXT =
  'Trajno brišeš fajlove ove reklame. Ne mogu se povratiti. Nastaviti?';

export function DeleteJobFiles({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function onDelete() {
    if (!window.confirm(CONFIRM_TEXT)) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (!res.ok) {
        setError(true);
        return;
      }
      // Server component page — the row's asset links and the "files deleted"
      // marker only change on a fresh server render.
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="btn-ghost text-sm text-err-text disabled:opacity-50"
      >
        {busy ? 'Brišem…' : 'Obriši'}
      </button>
      {error && (
        <span role="alert" className="text-xs text-err-text">
          Brisanje nije uspelo. Pokušaj ponovo.
        </span>
      )}
    </span>
  );
}
