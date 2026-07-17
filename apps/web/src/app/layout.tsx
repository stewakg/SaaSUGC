import type { Metadata, Viewport } from 'next';
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
  themeColor: '#08080A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sr" className="dark">
      <body className="min-h-screen bg-ink-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}