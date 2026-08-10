import { Composition, type CalculateMetadataFunction } from 'remotion';
import { MatrixAd } from './compositions/MatrixAd.tsx';
import { MATRIX_ASPECTS, MATRIX_FPS, DEFAULT_MATRIX_ASPECT, type MatrixAdProps } from '@adgen/core/types';
import {
  DEFAULT_BACKGROUND_VIDEO_URL,
  DEFAULT_MATRIX_CAPTION_STYLE,
  DEFAULT_MATRIX_OUTRO_TEXT,
} from '@adgen/core/constants';

/**
 * Studio-preview defaults — real renders always pass explicit `inputProps`
 * (built by LocalRemotionRenderer from the worker's job data).
 */
const defaultProps: MatrixAdProps = {
  shots: [{ url: DEFAULT_BACKGROUND_VIDEO_URL, startSec: 0, playSec: 7 }],
  captionWords: [
    { text: 'Stalno', startSec: 0, endSec: 0.4 },
    { text: 'ti', startSec: 0.4, endSec: 0.55 },
    { text: 'se', startSec: 0.55, endSec: 0.7 },
    { text: 'kasne', startSec: 0.7, endSec: 1.1 },
    { text: 'porudžbine?', startSec: 1.1, endSec: 1.8 },
    { text: 'Naruči', startSec: 2.2, endSec: 2.6 },
    { text: 'odmah', startSec: 2.6, endSec: 3.0 },
    { text: '—', startSec: 3.0, endSec: 3.1 },
    { text: 'plati', startSec: 3.1, endSec: 3.5 },
    { text: 'pouzećem!', startSec: 3.5, endSec: 4.2 },
  ],
  captionStyle: DEFAULT_MATRIX_CAPTION_STYLE,
  captionScale: 1,
  transitionIn: 'zoom-punch',
  outroText: DEFAULT_MATRIX_OUTRO_TEXT,
  durationInFrames: 210,
  fps: MATRIX_FPS,
};

const FALLBACK = MATRIX_ASPECTS[DEFAULT_MATRIX_ASPECT];

/**
 * Size comes from props so one composition serves every aspect ratio — the
 * alternative, one registered `<Composition>` per shape, would duplicate the
 * whole definition three times and drift. `selectComposition` in
 * `renderer.local.ts` runs this with the real inputProps before rendering, so
 * the mp4 is written at the size chosen in the wizard.
 *
 * Falls back to 9:16 when unset, which is what every job created before this
 * was selectable sends.
 */
const calculateMetadata: CalculateMetadataFunction<MatrixAdProps> = async ({ props }) => ({
  durationInFrames: props.durationInFrames,
  fps: props.fps,
  width: props.width ?? FALLBACK.width,
  height: props.height ?? FALLBACK.height,
});

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="matrix-ad"
      component={MatrixAd}
      durationInFrames={defaultProps.durationInFrames}
      fps={defaultProps.fps}
      width={FALLBACK.width}
      height={FALLBACK.height}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
    />
  );
};
