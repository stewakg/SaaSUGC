'use client';

import { useRef, useState } from 'react';
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
  // enter/leave fire for every nested element, so we count crossings rather
  // than trusting a single dragleave (see the class comment above).
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  function openPicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(files);
    // Reset so choosing the SAME file again still fires a change event.
    e.target.value = '';
  }

  function handleDragEnter(e: React.DragEvent<HTMLButtonElement>) {
    if (disabled) return;
    e.preventDefault();
    dragDepth.current += 1;
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
    const files = Array.from(e.dataTransfer.files).filter(
      (entry): entry is File => entry instanceof File,
    );
    if (files.length > 0) onFiles(files);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={disabled}
        className={cn(
          'focus-ring flex w-full flex-col items-center gap-1 rounded-card border-2 border-dashed bg-panel p-8 text-center transition disabled:cursor-not-allowed disabled:opacity-50',
          dragging ? 'border-accent bg-accent-soft' : 'border-line',
        )}
      >
        <span className="text-sm font-medium text-txt-hi">{title}</span>
        {hint && <span className="text-xs text-txt-mid">{hint}</span>}
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
