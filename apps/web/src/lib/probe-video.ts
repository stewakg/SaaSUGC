/**
 * Measure a picked video file in the browser, before it is uploaded.
 *
 * Exists for one reason: `enhance` refuses clips that would cost more than the
 * job earns (see planEnhanceVideo in @adgen/core), and without this the customer
 * would push 200 MB across the wire, wait, and only then be told no. The WORKER
 * still probes the stored source and makes the real decision — this is courtesy,
 * not a control.
 *
 * `<video>` metadata gives duration and dimensions and nothing else; there is no
 * frame-rate reading in any shipping browser API, which is why `fps` is absent
 * from the result and the fps pin is applied worker-side only.
 *
 * The object URL is revoked on every exit path — a leaked one holds the whole
 * file in memory for the life of the tab, and this runs on files up to 200 MB.
 */
export interface ProbedVideo {
  durationSec: number;
  width: number;
  height: number;
}

/** How long to wait for `loadedmetadata` before treating the file as unreadable. */
const PROBE_TIMEOUT_MS = 15_000;

export function probeVideoFile(file: File): Promise<ProbedVideo> {
  return new Promise((resolve) => {
    const unreadable: ProbedVideo = { durationSec: 0, width: 0, height: 0 };
    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      resolve(unreadable);
      return;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    // Muted + no autoplay: nothing here plays, but a stray policy prompt on a
    // hidden element is a support ticket nobody can reproduce.
    video.muted = true;

    let settled = false;
    const finish = (result: ProbedVideo) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const timer = setTimeout(() => finish(unreadable), PROBE_TIMEOUT_MS);

    video.onloadedmetadata = () => {
      // A fragmented/streamed file can report Infinity here; that is not a
      // measurement, so it takes the unreadable path like any other failure.
      const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
      finish({ durationSec, width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = () => finish(unreadable);

    video.src = objectUrl;
  });
}
