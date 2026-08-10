/**
 * youtube-dl-exec ships `src/constants.js` (which resolves the downloaded
 * yt-dlp binary) but does not re-export it from its `index.d.ts`. The package
 * has no `exports` map, so the subpath import is legal at runtime — it just
 * needs a type for it.
 */
declare module 'youtube-dl-exec/src/constants' {
  /** Absolute path to the yt-dlp binary fetched by the package's postinstall. */
  export const YOUTUBE_DL_PATH: string;
}
