import type { Config } from 'tailwindcss';

/**
 * Dark-first theme matching the EcomAlati aesthetic:
 * near-black backgrounds, gradient tool cards, yellow (#FFE000) accent.
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
        // Near-black surface scale.
        ink: {
          950: '#08080A',
          900: '#0C0C0F',
          850: '#121216',
          800: '#17171C',
          700: '#1F1F26',
          600: '#2A2A33',
          500: '#3A3A45',
        },
        // Brand accent (EcomAlati-ish yellow).
        brand: {
          DEFAULT: '#FFE000',
          50: '#FFFCEB',
          100: '#FFF8CC',
          200: '#FFF199',
          300: '#FFE966',
          400: '#FFE000',
          500: '#E6C900',
          600: '#B39E00',
          700: '#807000',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-card':
          'linear-gradient(135deg, rgba(255,224,0,0.12) 0%, rgba(12,12,15,0.4) 60%, rgba(8,8,10,0.9) 100%)',
        'glow-brand':
          'radial-gradient(600px circle at 50% 0%, rgba(255,224,0,0.10), transparent 70%)',
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(255,224,0,0.35)',
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
  plugins: [],
};

export default config;