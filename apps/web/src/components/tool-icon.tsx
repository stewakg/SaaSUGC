import { Image, Video, Scissors, Sparkles, Layers, Zap, Languages, Eraser, User, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Maps JobDescriptor.icon (see packages/core/src/pricing.ts) to a lucide icon. */
const ICONS: Record<string, typeof Image> = {
  image: Image,
  video: Video,
  scissors: Scissors,
  sparkles: Sparkles,
  layers: Layers,
  zap: Zap,
  languages: Languages,
  eraser: Eraser,
  user: User,
};

/**
 * Icon chip for a tool card.
 * - `default`: brand-colored glyph in a soft rounded square (dark cards,
 *   utility rows) — matches the card-gradient/badge look in globals.css.
 * - `onColor`: white glyph in a frosted white circle, for the big vivid
 *   gradient "main tier" cards (EcomAlati-style) where the card itself
 *   already carries the color.
 */
export function ToolIcon({
  icon,
  variant = 'default',
  className,
}: {
  icon?: string;
  variant?: 'default' | 'onColor';
  className?: string;
}) {
  const Icon = (icon && ICONS[icon]) || Wand2;
  return (
    <div
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
        variant === 'onColor'
          ? 'bg-white/20 text-white backdrop-blur-sm'
          : 'border border-brand-400/20 bg-brand-400/10 text-brand-300',
        className,
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={2} />
    </div>
  );
}
