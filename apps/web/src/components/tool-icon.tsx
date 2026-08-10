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
 * Icon chip for a tool card — one treatment, `.icon-chip` in globals.css.
 *
 * There used to be a second `onColor` variant for the big vivid per-tool
 * gradient cards. Those gradients are gone (colour carries state, not tool
 * identity), so the variant it existed for is gone with them.
 */
export function ToolIcon({ icon, className }: { icon?: string; className?: string }) {
  const Icon = (icon && ICONS[icon]) || Wand2;
  return (
    <div className={cn('icon-chip', className)}>
      <Icon className="h-5 w-5" strokeWidth={2} />
    </div>
  );
}
