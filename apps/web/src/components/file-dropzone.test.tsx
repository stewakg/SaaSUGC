// @vitest-environment jsdom
/**
 * Tests for FileDropzone.
 *
 * ENVIRONMENT:
 * - This file opts into jsdom (see the docblock above) — the suite default is
 *   node, deliberately, so the API-route tests keep their real Request/Response.
 * - There is NO @testing-library/react: the component is mounted with
 *   react-dom/client's createRoot and driven with plain dispatchEvent, wrapped
 *   in React.act (this is React 19 RC, which exports act from 'react'; it also
 *   requires globalThis.IS_REACT_ACT_ENVIRONMENT, set below).
 * - jsdom has no DataTransfer constructor, so drop/dragover events are plain
 *   Events with a `dataTransfer` property attached via Object.defineProperty.
 * - React attaches its listeners at the root container, so events are
 *   dispatched on the real button and left to bubble, with the container
 *   attached to document.body — otherwise synthetic events never fire.
 *
 * What is tested for real:
 * - `fileMatchesAccept`, the exact filter handleDrop runs on every drop.
 * - A server render with title, hint and the VERBATIM rejection copy.
 * - The six interactive drop cases: valid file, multiple files, wrong type,
 *   mixed drop, disabled, and the document-level dragover/drop guard.
 *
 * '@/lib/utils' is a tsconfig path, aliased in vitest.config.ts; it is
 * factory-mocked with a faithful `cn` so no styling dependencies load.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('@/lib/utils', () => ({
  cn: (...parts: Array<string | false | null | undefined>) =>
    parts.filter(Boolean).join(' '),
}));

import { FileDropzone, fileMatchesAccept } from './file-dropzone';
import * as React from 'react';

// React 19's act() refuses to run unless this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// vitest transforms .tsx with the CLASSIC JSX runtime here (tsconfig says
// jsx: "preserve", which Next/SWC handles but vite's esbuild does not), so
// executing the component's JSX needs a `React` binding in scope. Providing
// it globally is exactly what the classic transform expects.
(globalThis as { React?: typeof React }).React = React;

const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm';

function videoFile(name = 'klip.mp4', type = 'video/mp4'): File {
  return new File(['x'], name, { type });
}

describe('fileMatchesAccept', () => {
  it('matches an exact MIME type (case-insensitive)', () => {
    expect(fileMatchesAccept(videoFile(), 'video/mp4')).toBe(true);
    expect(fileMatchesAccept(videoFile('klip.mp4', 'VIDEO/MP4'), 'video/mp4')).toBe(true);
  });

  it('matches a video/* wildcard for any video type and nothing else', () => {
    expect(fileMatchesAccept(videoFile('k.webm', 'video/webm'), 'video/*')).toBe(true);
    expect(fileMatchesAccept(videoFile('d.pdf', 'application/pdf'), 'video/*')).toBe(false);
  });

  it('matches a .mp4 extension against the lowercased file name', () => {
    expect(fileMatchesAccept(videoFile('KLIP.MP4', ''), '.mp4')).toBe(true);
    expect(fileMatchesAccept(videoFile('klip.mov', ''), '.mp4')).toBe(false);
  });

  it('rejects a type that is not in the list', () => {
    expect(fileMatchesAccept(videoFile('d.pdf', 'application/pdf'), 'video/mp4')).toBe(false);
  });

  it('treats an empty accept string as matching everything', () => {
    expect(fileMatchesAccept(videoFile('d.pdf', 'application/pdf'), '')).toBe(true);
    expect(fileMatchesAccept(videoFile('d.pdf', 'application/pdf'), '   ')).toBe(true);
  });

  it('matches when ANY entry of a comma-separated list matches (with trimming)', () => {
    expect(fileMatchesAccept(videoFile('k.mov', 'video/quicktime'), VIDEO_ACCEPT)).toBe(true);
    expect(fileMatchesAccept(videoFile('k.webm', 'video/webm'), ` ${VIDEO_ACCEPT} `)).toBe(true);
    expect(fileMatchesAccept(videoFile('d.pdf', 'application/pdf'), VIDEO_ACCEPT)).toBe(false);
  });
});

describe('FileDropzone render (react-dom/server — no DOM events available)', () => {
  it('renders the title and hint', () => {
    const zone = h(FileDropzone, {
      accept: VIDEO_ACCEPT,
      title: 'Klikni ili prevuci video ovde',
      hint: 'MP4, MOV ili WEBM · do 200MB',
      onFiles: () => undefined,
    });
    // Cast: @types/react-dom here resolves against @types/react@18 while the
    // app is on the react-19 rc types, so the element type does not line up
    // with renderToStaticMarkup's parameter at the type level.
    type StaticMarkupInput = Parameters<typeof renderToStaticMarkup>[0];
    const html = renderToStaticMarkup(zone as unknown as StaticMarkupInput);
    expect(html).toContain('Klikni ili prevuci video ovde');
    // Since 2026-08-18 the hint renders as format CHIPS: the same string,
    // split on '·' — both halves must survive, the separator itself does not.
    expect(html).toContain('MP4, MOV ili WEBM');
    expect(html).toContain('do 200MB');
    // A real <button> plus the hidden picker input, sibling not nested.
    expect(html).toContain('<button');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="video/mp4,video/quicktime,video/webm"');
    expect(html).not.toContain('Pogrešan tip fajla.');
  });
});

/*
 * Interactive drop behaviour, mounted for real in jsdom. Every mount and every
 * event dispatch is wrapped in React.act so React flushes the state updates
 * the handlers schedule (setDragging/setWrongType) before the assertions.
 */
describe('FileDropzone drop behaviour', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  interface MountedZone {
    onFiles: ReturnType<typeof vi.fn<(files: File[]) => void>>;
    button: HTMLButtonElement;
    container: HTMLDivElement;
  }

  /** Mounts one dropzone on a container attached to document.body. */
  function mountDropzone(
    overrides: Partial<React.ComponentProps<typeof FileDropzone>> = {},
  ): MountedZone {
    const onFiles = vi.fn<(files: File[]) => void>();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    // JSX rather than createElement: under this repo's React 19 RC types
    // (`@types/react: npm:types-react@rc`) a FunctionComponentElement is not
    // assignable to root.render's ReactNode — it wants `children` for
    // ReactPortal. A JSX element types cleanly and renders identically.
    React.act(() => {
      root.render(
        <FileDropzone
          accept={VIDEO_ACCEPT}
          title="Klikni ili prevuci video ovde"
          hint="MP4, MOV ili WEBM · do 200MB"
          onFiles={onFiles}
          {...overrides}
        />,
      );
    });
    const button = container.querySelector('button');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('dropzone did not render a <button>');
    }
    cleanups.push(() => {
      React.act(() => {
        root.unmount();
      });
      container.remove();
    });
    return { onFiles, button, container };
  }

  /**
   * jsdom has no DataTransfer, so the payload rides on a plain Event with a
   * `dataTransfer` property. Dispatched on the button itself; React listens
   * at the root container, so the event must be left to bubble up to it.
   */
  function dropFiles(node: Element, files: File[]): void {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    React.act(() => {
      node.dispatchEvent(event);
    });
  }

  it('a valid dropped file reaches onFiles once with that file', () => {
    const { onFiles, button } = mountDropzone();
    const file = videoFile();
    dropFiles(button, [file]);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('multiple dropped files are passed in one onFiles call', () => {
    const { onFiles, button } = mountDropzone();
    const first = videoFile('prvi.mp4');
    const second = videoFile('drugi.webm', 'video/webm');
    dropFiles(button, [first, second]);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles).toHaveBeenCalledWith([first, second]);
  });

  it('a drop with no accepted files shows "Pogrešan tip fajla." and does not call onFiles', () => {
    const { onFiles, button, container } = mountDropzone();
    dropFiles(button, [videoFile('dokument.pdf', 'application/pdf')]);
    expect(onFiles).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Pogrešan tip fajla.');
  });

  it('a mixed drop passes only the accepted files to onFiles', () => {
    const { onFiles, button } = mountDropzone();
    const mp4 = videoFile('klip.mp4');
    const pdf = videoFile('dokument.pdf', 'application/pdf');
    dropFiles(button, [mp4, pdf]);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles).toHaveBeenCalledWith([mp4]);
  });

  it('disabled blocks a drop', () => {
    const { onFiles, button } = mountDropzone({ disabled: true });
    dropFiles(button, [videoFile()]);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('the document guard prevents dragover outside the dropzone but not on the dropzone itself', () => {
    const { button } = mountDropzone();

    // Outside: a dragover on document.body must be neutralised by the
    // document-level guard, or a missed drop navigates the tab to the file.
    const outside = new Event('dragover', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(true);

    // On the dropzone: the button's own onDragOver preventDefaults (it must,
    // or the browser would not deliver the drop), so this being prevented
    // proves nothing about the guard by itself —
    const onButton = new Event('dragover', { bubbles: true, cancelable: true });
    button.dispatchEvent(onButton);
    expect(onButton.defaultPrevented).toBe(true);

    // — therefore the discriminating check: a DISABLED zone's own handler
    // returns early without preventing, so any preventDefault on this event
    // could only have come from the document guard. The guard must skip it,
    // because the target is inside the dropzone's own button.
    const disabled = mountDropzone({ disabled: true });
    const label = disabled.button.querySelector('span');
    if (!(label instanceof HTMLSpanElement)) {
      throw new Error('dropzone did not render a label <span>');
    }
    const onZone = new Event('dragover', { bubbles: true, cancelable: true });
    label.dispatchEvent(onZone);
    expect(onZone.defaultPrevented).toBe(false);
  });
});
