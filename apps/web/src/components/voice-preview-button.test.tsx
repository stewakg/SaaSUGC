// @vitest-environment jsdom
/**
 * VoicePreviewButton — the assertions with teeth: the audio URL is built from
 * the SELECTED voice id (a wrong id plays someone else's voice into a
 * customer's decision), and a missing preview degrades to a disabled button,
 * never a broken wizard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as React from 'react';

(globalThis as { React?: typeof React }).React = React;

import { VoicePreviewButton } from './voice-preview-button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom has no Audio implementation — a recording fake stands in. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  /** Test 3 arms this so the FIRST play rejects, like a 404'd preview. */
  static nextPlayRejects = false;
  src: string;
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() =>
    FakeAudio.nextPlayRejects ? Promise.reject(new Error('404')) : Promise.resolve(),
  );
  pause = vi.fn();
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.nextPlayRejects = false;
  vi.stubGlobal('Audio', FakeAudio);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function mount(voiceId: string) {
  act(() => {
    root.render(<VoicePreviewButton voiceId={voiceId} />);
  });
}

function click() {
  const button = container.querySelector('button');
  if (!button) throw new Error('button not rendered');
  return act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('VoicePreviewButton', () => {
  it('1. builds the audio URL from the SELECTED voice id and plays it', async () => {
    mount('v123');

    await click();

    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toBe('/api/storage/previews/voices/v123.mp3');
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Zaustavi');
  });

  it('2. a second click PAUSES — the button is a toggle, not a restart', async () => {
    mount('v123');
    await click();

    await click();

    expect(FakeAudio.instances[0].pause).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Preslušaj');
  });

  it('3. a play rejection (missing preview) disables the button instead of breaking', async () => {
    mount('v123');
    FakeAudio.nextPlayRejects = true;

    await click();

    const button = container.querySelector('button');
    expect(button?.disabled).toBe(true);
    expect(container.textContent).toContain('Nema preview-a');
  });

  it('4. an empty voice id renders NOTHING — no button pointing at previews/voices/.mp3', () => {
    mount('');
    expect(container.querySelector('button')).toBeNull();
  });
});
