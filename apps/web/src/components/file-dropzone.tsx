'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Called with the picked/dropped files. The caller does the uploading. */
  onFiles: (files: File[]) => void;
  /** Main line, e.g. "Klikni ili prevuci video ovde". */
  title: string;
  /** Small line under it, e.g. the accepted formats and size cap. */
  hint?: string;
}

/**
 * Matches a File against an `accept` attribute using the same rules a browser
 * applies in the file-picker dialog (the attribute does NOT filter drops):
 * - a comma-separated list; an entry matches if ANY of them matches,
 * - `video/mp4` matches an equal `file.type` (case-insensitive),
 * - `video/*` matches any type starting with `video/`,
 * - `.mp4` matches a file NAME ending with it (lowercased both sides),
 * - an empty/missing list accepts everything.
 */
export function fileMatchesAccept(file: File, accept: string): boolean {
  const entries = accept
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return entries.some((entry) => {
    if (entry.startsWith('.')) return name.endsWith(entry);
    if (entry.endsWith('/*')) return type.startsWith(entry.slice(0, -1));
    return type === entry;
  });
}

/**
 * Reusable drag-and-drop file picker — plain React, no extra dependencies.
 *
 * Renders a large dashed drop area as a real <button> (so it is focusable and
 * Enter/Space open the picker for free) backed by a hidden <input type="file">.
 * The caller owns the upload: onFiles hands over the picked/dropped File[] and
 * this component resets nothing else.
 *
 * Drag state is tracked with a DEPTH COUNTER rather than a boolean: dragging
 * across a child element fires dragenter/dragleave on the parent, so a naive
 * boolean flickers on/off as the cursor crosses nested nodes. The counter only
 * reaches zero when the pointer truly leaves the drop area.
 */
export function FileDropzone({
  accept,
  multiple,
  disabled,
  onFiles,
  title,
  hint,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLButtonElement>(null);
  // enter/leave fire for every nested element, so we count crossings rather
  // than trusting a single dragleave (see the class comment above).
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [wrongType, setWrongType] = useState(false);

  // A drop that MISSES the dropzone falls through to the browser default:
  // the tab navigates to the file, destroying the whole wizard. Blocking the
  // default on `document` neutralises those near-misses. Only events aimed at
  // a dropzone are left alone — a dropzone's own handlers (which preventDefault
  // themselves, when enabled) must keep working.
  useEffect(() => {
    function guard(e: DragEvent) {
      // Skip ANY dropzone, not just this one. Checking `dropRef.current` alone
      // was wrong the moment two dropzones are mounted together: zone A's guard
      // saw an event aimed at zone B as "outside" and prevented it. That is
      // invisible for an enabled B, whose own handler prevents anyway — but for
      // a DISABLED B, whose handler deliberately returns without preventing so
      // the cursor shows "no drop", A's guard silently re-enabled the drop
      // cursor over an area that then swallows the file. Found by the test that
      // uses a disabled zone as the discriminator; the old comment here claimed
      // several mounted dropzones were harmless, and it was wrong.
      if (e.target instanceof Element && e.target.closest('[data-dropzone]')) return;
      e.preventDefault();
    }
    document.addEventListener('dragover', guard);
    document.addEventListener('drop', guard);
    return () => {
      document.removeEventListener('dragover', guard);
      document.removeEventListener('drop', guard);
    };
  }, []);

  function openPicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      setWrongType(false);
      onFiles(files);
    }
    // Reset so choosing the SAME file again still fires a change event.
    e.target.value = '';
  }

  function handleDragEnter(e: React.DragEvent<HTMLButtonElement>) {
    if (disabled) return;
    e.preventDefault();
    dragDepth.current += 1;
    setWrongType(false);
    setDragging(true);
  }

  function handleDragOver(e: React.DragEvent<HTMLButtonElement>) {
    if (disabled) return;
    // Mandatory: without preventDefault the browser opens the dropped file
    // instead of letting onDrop run. Skipping it while disabled also keeps the
    // cursor in "no drop" mode, so a disabled area cannot receive a drop.
    e.preventDefault();
  }

  function handleDragLeave(e: React.DragEvent<HTMLButtonElement>) {
    if (disabled) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLButtonElement>) {
    if (disabled) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      (entry): entry is File => entry instanceof File,
    );
    if (dropped.length === 0) return;
    // The `accept` attribute only filters the picker dialog — drops must be
    // checked here, or the file is uploaded only to be rejected by the server.
    const accepted = dropped.filter((file) => fileMatchesAccept(file, accept));
    if (accepted.length === 0) {
      setWrongType(true);
      return;
    }
    setWrongType(false);
    onFiles(accepted);
  }

  return (
    <>
      {/* `data-dropzone` is read by the document-level guard above, which has
          to recognise EVERY dropzone, not only the one that installed the
          listener. */}
      <button
        ref={dropRef}
        data-dropzone=""
        type="button"
        onClick={openPicker}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={disabled}
        className={cn(
          'focus-ring flex w-full flex-col items-center gap-3 rounded-card border-2 border-dashed bg-panel px-8 py-12 text-center transition disabled:cursor-not-allowed disabled:opacity-50',
          dragging ? 'border-accent bg-accent-soft' : 'border-line',
        )}
      >
        {/* Big icon plate + bold title + the hint split into format chips —
            the generous, competitor-class drop area (2026-08-18). The chips
            are the SAME hint string, split on '·'; no new copy. */}
        <span className="icon-chip" aria-hidden="true">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="5" width="14" height="14" rx="2.5" />
            <path d="m21.5 7.5-5 3.5 5 3.5v-7Z" />
          </svg>
        </span>
        <span className="text-base font-semibold text-txt-hi">{title}</span>
        {wrongType ? (
          <span role="alert" className="text-xs text-err-text">Pogrešan tip fajla.</span>
        ) : (
          hint && (
            <span className="flex flex-wrap items-center justify-center gap-1.5">
              {hint.split('·').map((part) => (
                <span
                  key={part}
                  className="rounded-lg border border-line bg-panel-2 px-2.5 py-1 font-mono text-[11px] text-txt-mid"
                >
                  {part.trim()}
                </span>
              ))}
            </span>
          )
        )}
      </button>
      {/* Sibling, not a child: nesting <input> inside <button> is invalid HTML. */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        aria-label={title}
        className="hidden"
      />
    </>
  );
}
