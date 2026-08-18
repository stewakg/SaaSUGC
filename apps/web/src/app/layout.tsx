import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Space_Grotesk } from 'next/font/google';
import { isThemeId, THEME_COOKIE } from '@/lib/theme';
import { SIGNUP_BONUS_CREDITS, freeVideosLabel } from '@adgen/core/pricing';
import './globals.css';

export const metadata: Metadata = {
  title: 'AdGen — AI reklame za COD prodavnice',
  // Two things were wrong here and both were invisible on screen, which is why
  // they survived the copy pass: this string is what Google and every link
  // preview show. It promised MUSIC, which the product has never had (the same
  // claim was removed from the landing hero and the translate card), and it
  // hard-coded the signup bonus, so changing SIGNUP_BONUS_CREDITS would have
  // left the search result advertising the old number in the wrong plural.
  description:
    `Generiši reklamne slike i videe za Balkan COD e-commerce. Skripta, glas, titl, CTA — sve u jednom. ${freeVideosLabel(SIGNUP_BONUS_CREDITS)} na registraciji.`,
  keywords: [
    'AI reklame',
    'video generator',
    'COD e-commerce',
    'Srbija',
    'Balkan',
    // 'Remotion' was in this list: our renderer, not a term any Serbian seller
    // searches for. It told competitors what we run and brought no traffic.
  ],
};

export const viewport: Viewport = {
  // Matches the two grounds a first-time visitor can land on: the OS decides
  // until they pick a theme (globals.css, prefers-color-scheme block).
  // Dark is premijera's ground since 2026-08-18.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F6F9' },
    { media: '(prefers-color-scheme: dark)', color: '#0D0C11' },
  ],
  width: 'device-width',
  initialScale: 1,
};

// Space Grotesk carries the display type in every theme (see --font-display in
// globals.css). latin-ext is what keeps č ć š ž đ in the same face instead of
// falling back mid-word. Self-hosted by next/font at build time — no runtime
// request to Google.
const displayFont = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '700'],
  variable: '--font-display-face',
  display: 'swap',
});

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
    <html lang="sr" data-theme={theme} className={displayFont.variable}>
      <body className="min-h-screen bg-ground text-txt-hi antialiased">
        {children}
      </body>
    </html>
  );
}
