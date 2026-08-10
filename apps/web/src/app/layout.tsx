import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { isThemeId, THEME_COOKIE } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'AdGen — AI reklame za COD prodavnice',
  description:
    'Generiši reklamne slike i videe za Balkan COD e-commerce. Skripta, glas, titl, muzika, CTA — sve u jednom. 3 besplatna videa na registraciji.',
  keywords: [
    'AI reklame',
    'video generator',
    'COD e-commerce',
    'Srbija',
    'Balkan',
    'Remotion',
  ],
};

export const viewport: Viewport = {
  // Matches the two grounds a first-time visitor can land on: the OS decides
  // until they pick a theme (globals.css, prefers-color-scheme block).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F6F9' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0C10' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Rendering the chosen theme server-side is what stops the first paint from
  // flashing the wrong one. No cookie means no attribute, which lets the
  // prefers-color-scheme default in globals.css apply — an explicit choice
  // always beats the OS, and the OS only speaks when nobody has chosen.
  const picked = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isThemeId(picked) ? picked : undefined;

  return (
    <html lang="sr" data-theme={theme}>
      <body className="min-h-screen bg-ground text-txt-hi antialiased">
        {children}
      </body>
    </html>
  );
}
