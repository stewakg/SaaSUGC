import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

/**
 * Utility names are a thin mapping onto the CSS custom properties defined in
 * src/app/globals.css. Colours are never literals here — a theme is one token
 * block over there, so anything hard-coded in this file would be a colour that
 * only one of the three themes gets right.
 *
 * Colours written as `rgb(var(--x-c) / <alpha-value>)` are the ones Tailwind's
 * opacity modifiers work on (`bg-accent/10`); the rest take the ready token.
 *
 * `ink`, `brand` and `zinc` are kept pointing at sensible token values so the
 * ~250 call sites that still use them stay coherent in all three themes while
 * Prompts 3–6 migrate them.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ground: 'rgb(var(--ground-c) / <alpha-value>)',
        panel: {
          DEFAULT: 'var(--panel)',
          2: 'var(--panel-2)',
          solid: 'rgb(var(--panel-c) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        txt: {
          hi: 'var(--txt-hi)',
          mid: 'var(--txt-mid)',
          low: 'var(--txt-low)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent-c) / <alpha-value>)',
          2: 'rgb(var(--accent-2-c) / <alpha-value>)',
          contrast: 'var(--accent-contrast)',
          soft: 'var(--accent-soft)',
          ring: 'var(--accent-ring)',
          text: 'var(--accent-text)',
        },
        live: 'rgb(var(--live-c) / <alpha-value>)',
        ok: 'rgb(var(--ok-c) / <alpha-value>)',
        warn: 'rgb(var(--warn-c) / <alpha-value>)',
        err: 'rgb(var(--err-c) / <alpha-value>)',

        // --- legacy names, now token-backed (migrated away in Prompts 3–6) ---
        ink: {
          950: 'rgb(var(--ground-c) / <alpha-value>)',
          900: 'rgb(var(--ground-c) / <alpha-value>)',
          850: 'rgb(var(--panel-c) / <alpha-value>)',
          800: 'rgb(var(--panel-c) / <alpha-value>)',
          700: 'var(--line-strong)',
          600: 'var(--line-strong)',
          500: 'var(--txt-low)',
        },
        brand: {
          DEFAULT: 'rgb(var(--accent-c) / <alpha-value>)',
          50: 'var(--accent-soft)',
          100: 'var(--accent-soft)',
          200: 'rgb(var(--accent-c) / <alpha-value>)',
          300: 'rgb(var(--accent-c) / <alpha-value>)',
          400: 'rgb(var(--accent-c) / <alpha-value>)',
          500: 'rgb(var(--accent-c) / <alpha-value>)',
          600: 'rgb(var(--accent-c) / <alpha-value>)',
          700: 'rgb(var(--accent-c) / <alpha-value>)',
        },
        // zinc is text-only in this app, so pointing it at the text ramp makes
        // every unmigrated screen legible in the light theme too.
        zinc: {
          100: 'var(--txt-hi)',
          200: 'var(--txt-hi)',
          300: 'var(--txt-mid)',
          400: 'var(--txt-mid)',
          500: 'var(--txt-low)',
          600: 'var(--txt-low)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        head: '-0.02em',
        'head-tight': '-0.035em',
      },
      borderRadius: {
        panel: 'var(--radius-panel)',
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
      },
      backgroundImage: {
        action: 'var(--action-grad)',
        'text-grad': 'var(--text-grad)',
        'gradient-card':
          'linear-gradient(135deg, var(--accent-soft) 0%, transparent 60%)',
        'glow-brand':
          'radial-gradient(600px circle at 50% 0%, var(--accent-soft), transparent 70%)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        glow: 'var(--shadow-glow)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        // Every alignable number in the app (credits, timers, dimensions) is
        // mono with tabular figures so columns of them stop dancing.
        '.tabular': { 'font-variant-numeric': 'tabular-nums' },
      });
    }),
  ],
};

export default config;
