import { Composition, type CalculateMetadataFunction } from 'remotion';
import { MatrixAd } from './compositions/MatrixAd.tsx';
import { MATRIX_FPS, type MatrixAdProps } from '@adgen/core/types';
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
  backgroundVideoUrl: DEFAULT_BACKGROUND_VIDEO_URL,
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

const calculateMetadata: CalculateMetadataFunction<MatrixAdProps> = async ({ props }) => ({
  durationInFrames: props.durationInFrames,
  fps: props.fps,
});

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="matrix-ad"
      component={MatrixAd}
      durationInFrames={defaultProps.durationInFrames}
      fps={defaultProps.fps}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
    />
  );
};
