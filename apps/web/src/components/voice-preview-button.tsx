'use client';

/**
 * ▶ next to the voice picker — plays the pre-generated preview line („Ovako bi
 * zvučala vaša reklama.") for the selected voice. The mp3s live in R2 under
 * `previews/voices/<voiceId>.mp3` (written by gen-voice-previews.mjs) and are
 * served through /api/storage, which allows the `previews/` prefix to any
 * signed-in user.
 *
 * A missing preview (a voice added after the driver's last run) degrades to a
 * disabled button, never an error state in the wizard.
 */
import { useEffect, useRef, useState } from 'react';

export function VoicePreviewButton({ voiceId }: { voiceId: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  // Switching voices invalidates the loaded clip AND the failed flag —
  // the next voice may well have a preview even if this one did not.
  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setFailed(false);
  }, [voiceId]);

  // Unmount must not leave audio playing behind the wizard.
  useEffect(() => () => audioRef.current?.pause(), []);

  function toggle() {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (!audioRef.current) {
      const audio = new Audio(`/api/storage/previews/voices/${voiceId}.mp3`);
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setFailed(true);
        setPlaying(false);
      };
      audioRef.current = audio;
    } else {
      audioRef.current.currentTime = 0;
    }
    audioRef.current
      .play()
      .then(() => setPlaying(true))
      .catch(() => setFailed(true));
  }

  if (!voiceId) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={failed}
      aria-label={playing ? 'Zaustavi preview glasa' : 'Preslušaj glas'}
      title={failed ? 'Preview za ovaj glas još ne postoji' : undefined}
      className="btn-ghost shrink-0 text-sm disabled:opacity-40"
    >
      {failed ? 'Nema preview-a' : playing ? '⏸ Zaustavi' : '▶ Preslušaj'}
    </button>
  );
}
