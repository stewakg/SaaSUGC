import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  OffthreadVideo,
  Series,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { MATRIX_INTRO_SECONDS, MATRIX_OUTRO_SECONDS } from '@adgen/core/types';
import type { CaptionWord, MatrixAdProps, MatrixTransition } from '@adgen/core/types';

// `Impact` is a proprietary system font not guaranteed present on a headless
// render host, so the "Impact" caption style maps to Anton (an open-license
// Google Font with a near-identical bold-condensed look). "Montserrat" maps
// to the real Montserrat. The `cap:<font>:...` prop format is kept as-is so a
// real Impact .ttf can be swapped in later without touching the pipeline.
const { fontFamily: antonFamily } = loadAnton();
const { fontFamily: montserratFamily } = loadMontserrat();

function parseCaptionStyle(style: string): { font: 'Impact' | 'Montserrat'; anim: 'smooth' | 'pop' | 'none'; color: string } {
  const parts = style.split(':');
  const font = parts[1] === 'Montserrat' ? 'Montserrat' : 'Impact';
  const animRaw = parts[2];
  const anim = animRaw === 'smooth' || animRaw === 'none' ? animRaw : 'pop';
  const color = parts[3] && /^#[0-9a-fA-F]{6}$/.test(parts[3]) ? parts[3] : '#FFE000';
  return { font, anim, color };
}

/** Groups words into ~2.2s karaoke lines (TikTok-caption style) so only a few words show at once. */
function groupWordsIntoLines(words: CaptionWord[], maxLineDurationSec = 2.2, maxWordsPerLine = 6): CaptionWord[][] {
  const lines: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  let lineStart = 0;
  for (const w of words) {
    if (current.length === 0) lineStart = w.startSec;
    current.push(w);
    if (w.endSec - lineStart >= maxLineDurationSec || current.length >= maxWordsPerLine) {
      lines.push(current);
      current = [];
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function getIntroContainerStyle(type: MatrixTransition, frame: number, introFrames: number): React.CSSProperties {
  if (frame >= introFrames) return {};
  const progress = frame / introFrames;
  switch (type) {
    case 'fade':
      return { opacity: interpolate(progress, [0, 1], [0, 1]) };
    case 'zoom-punch':
      return {
        transform: `scale(${interpolate(progress, [0, 1], [1.25, 1], { easing: Easing.out(Easing.cubic) })})`,
        opacity: interpolate(progress, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
      };
    case 'flash-whoosh':
      return { filter: `brightness(${interpolate(progress, [0, 0.4, 1], [3, 1.4, 1])})` };
    case 'color-pop':
      return { transform: `scale(${interpolate(progress, [0, 1], [1.05, 1])})` };
    default:
      return {};
  }
}

function IntroFlashOverlay({
  type,
  frame,
  introFrames,
  accentColor,
}: {
  type: MatrixTransition;
  frame: number;
  introFrames: number;
  accentColor: string;
}) {
  if (frame >= introFrames) return null;
  if (type !== 'flash-whoosh' && type !== 'color-pop') return null;
  const progress = frame / introFrames;
  const opacity = interpolate(progress, [0, 1], [0.85, 0], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ backgroundColor: type === 'flash-whoosh' ? '#ffffff' : accentColor, opacity }} />;
}

function CaptionWordEl({
  word,
  frame,
  fps,
  fontFamily,
  anim,
  activeColor,
  scale,
}: {
  word: CaptionWord;
  frame: number;
  fps: number;
  fontFamily: string;
  anim: 'smooth' | 'pop' | 'none';
  activeColor: string;
  scale: number;
}) {
  const currentSec = frame / fps;
  const isActive = currentSec >= word.startSec && currentSec < word.endSec;

  let wordScale = 1;
  if (isActive && anim !== 'none') {
    const localFrame = frame - Math.round(word.startSec * fps);
    wordScale =
      anim === 'pop'
        ? spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 200 }, from: 1.35, to: 1 })
        : interpolate(localFrame, [0, 6], [1.15, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  }

  return (
    <span
      style={{
        fontFamily,
        fontSize: 78 * scale,
        fontWeight: 800,
        color: isActive ? activeColor : '#ffffff',
        WebkitTextStroke: '2px black',
        textTransform: 'uppercase',
        display: 'inline-block',
        transform: `scale(${wordScale})`,
        lineHeight: 1.05,
      }}
    >
      {word.text}
    </span>
  );
}

function OutroCard({
  text,
  frame,
  fps,
  fontFamily,
  sfxUrl,
}: {
  text: string;
  frame: number;
  fps: number;
  fontFamily: string;
  sfxUrl?: string;
}) {
  const entrance = spring({ frame, fps, config: { damping: 14, stiffness: 180 }, from: 0.6, to: 1 });
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', opacity }}>
      {sfxUrl ? <Audio src={sfxUrl} /> : null}
      <div
        style={{
          transform: `scale(${entrance})`,
          background: 'linear-gradient(135deg, #FFE000, #FFB800)',
          borderRadius: 28,
          padding: '36px 48px',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          maxWidth: '82%',
        }}
      >
        <p
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 54,
            color: '#0a0a0a',
            textTransform: 'uppercase',
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {text}
        </p>
      </div>
    </AbsoluteFill>
  );
}

/**
 * The Matrix ad composition (F4, the differentiator): vertical 1080×1920,
 * background clip, karaoke captions, intro transition, outro CTA card.
 */
export const MatrixAd: React.FC<MatrixAdProps> = (props) => {
  const { shots, musicUrl, sfxUrl, captionWords, captionStyle, captionScale, transitionIn, outroText } =
    props;
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const currentSec = frame / fps;

  const { font, anim, color } = parseCaptionStyle(captionStyle);
  const fontFamily = font === 'Montserrat' ? montserratFamily : antonFamily;

  const introFrames = Math.max(1, Math.round(MATRIX_INTRO_SECONDS * fps));
  const outroStartFrame = Math.max(introFrames, durationInFrames - Math.round(MATRIX_OUTRO_SECONDS * fps));
  const showOutro = frame >= outroStartFrame;

  const lines = React.useMemo(() => groupWordsIntoLines(captionWords), [captionWords]);
  const activeLine = lines.find(
    (line) => currentSec >= line[0].startSec && currentSec < line[line.length - 1].endSec + 0.15,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={getIntroContainerStyle(transitionIn, frame, introFrames)}>
        <Series>
          {shots.map((shot, i) => (
            <Series.Sequence key={i} durationInFrames={Math.max(1, Math.round(shot.playSec * fps))}>
              <OffthreadVideo
                src={shot.url}
                trimBefore={Math.round(shot.startSec * fps)}
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </Series.Sequence>
          ))}
        </Series>
        {musicUrl && /^https?:\/\//.test(musicUrl) ? <Audio src={musicUrl} volume={0.25} /> : null}

        {activeLine && !showOutro ? (
          <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 220 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 14px', maxWidth: '86%' }}>
              {activeLine.map((word, i) => (
                <CaptionWordEl
                  key={`${word.startSec}-${i}`}
                  word={word}
                  frame={frame}
                  fps={fps}
                  fontFamily={fontFamily}
                  anim={anim}
                  activeColor={color}
                  scale={captionScale}
                />
              ))}
            </div>
          </AbsoluteFill>
        ) : null}
      </AbsoluteFill>

      <IntroFlashOverlay type={transitionIn} frame={frame} introFrames={introFrames} accentColor={color} />

      {showOutro ? (
        <OutroCard text={outroText} frame={frame - outroStartFrame} fps={fps} fontFamily={montserratFamily} sfxUrl={sfxUrl} />
      ) : null}
    </AbsoluteFill>
  );
};
