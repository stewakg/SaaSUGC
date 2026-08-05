import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  OffthreadVideo,
  Sequence,
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

function clampNum(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

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

/** Visual only — the CTA sound effect is sequenced at the composition root, not here. */
function OutroCard({
  text,
  frame,
  fps,
  fontFamily,
}: {
  text: string;
  frame: number;
  fps: number;
  fontFamily: string;
}) {
  const entrance = spring({ frame, fps, config: { damping: 14, stiffness: 180 }, from: 0.6, to: 1 });
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', opacity }}>
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
  const {
    shots,
    voiceUrl,
    musicUrl,
    musicVolume,
    sfxUrl,
    captionWords,
    captionStyle,
    captionScale,
    captionX,
    captionY,
    transitionIn,
    outroText,
  } = props;
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const currentSec = frame / fps;

  const { font, anim, color } = parseCaptionStyle(captionStyle);

  // Clamped so a bad prop can never push captions off-frame. The X bounds also keep the
  // block's own width on screen (see captionWidthPct below).
  const anchorX = clampNum(typeof captionX === 'number' ? captionX : 0.5, 0.15, 0.85);
  const anchorY = clampNum(typeof captionY === 'number' ? captionY : 0.46, 0.08, 0.92);
  // The block is centred on anchorX, so its half-width can only be as wide as the
  // distance to the nearer edge — otherwise moving it sideways would clip the text.
  const captionWidthPct = Math.min(0.86, 2 * Math.min(anchorX, 1 - anchorX)) * 100;
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
      {/*
        Audio lives at the composition ROOT, deliberately outside the intro-transition
        container below — that container animates opacity/filter/transform, and audio
        must not be entangled with a visual wrapper. Voice sits above the music: music
        drops to 0.25 so the voiceover stays intelligible. Both are guarded on an
        absolute http(s) url — the mock voice provider returns a `data:` URI Remotion
        cannot stream, and a relative storage url is not fetchable from the renderer.
      */}
      {voiceUrl && /^https?:\/\//.test(voiceUrl) ? <Audio src={voiceUrl} volume={1} /> : null}
      {/*
        The CTA sound effect MUST be wrapped in a <Sequence from={outroStartFrame}>.
        An <Audio> with no enclosing Sequence is treated as starting at composition
        frame 0, so mounting it late (when the outro card appears ~9s in) just plays
        a point past the clip's end — i.e. silence. It lived inside OutroCard and was
        silently broken that way until it was first actually exercised on 2026-08-05.
      */}
      {sfxUrl && /^https?:\/\//.test(sfxUrl) ? (
        <Sequence from={outroStartFrame}>
          <Audio src={sfxUrl} />
        </Sequence>
      ) : null}
      {musicUrl && /^https?:\/\//.test(musicUrl) ? (
        <Audio src={musicUrl} volume={clampNum(typeof musicVolume === 'number' ? musicVolume : 0.25, 0, 1)} />
      ) : null}

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
        {/*
          Caption placement is user-controllable (captionX/captionY, fractions of the
          frame) and DEFAULTS to just above centre — never the bottom. The bottom ~15%
          of a 9:16 frame is covered by TikTok/Reels chrome (username, description,
          music ticker, side buttons), so bottom-anchored text collides with it in-feed;
          centre also keeps the viewer's eye on the product. The clamps above stop any
          value from pushing text off-frame or under that chrome entirely.
        */}
        {activeLine && !showOutro ? (
          <AbsoluteFill>
            <div
              style={{
                position: 'absolute',
                top: `${anchorY * 100}%`,
                left: `${anchorX * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: `${captionWidthPct}%`,
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '0 14px',
              }}
            >
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
        <OutroCard text={outroText} frame={frame - outroStartFrame} fps={fps} fontFamily={montserratFamily} />
      ) : null}
    </AbsoluteFill>
  );
};
