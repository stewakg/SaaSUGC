import Link from 'next/link';
import { creditsLabel } from '@adgen/core/pricing';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolIcon } from '@/components/tool-icon';

interface ToolCardProps {
  icon?: string;
  label: string;
  description: string;
  cost: number;
  href?: string;
  soon?: boolean;
  /** Identity hue from the tool descriptor — see toolToneClass below. */
  theme?: string;
  /**
   * Whether to show the credit price on the card. True on the dashboard, where
   * the visitor already has a balance and the number is the thing they are
   * deciding with. FALSE on the landing page: a stranger who has never seen a
   * price list reads "8 kredita" as a number with no unit, and the first
   * question a landing page has to answer is what the tool does, not what it
   * costs in an internal currency. Pricing gets its own place.
   */
  showCost?: boolean;
}

/**
 * Map a descriptor's `theme` to its card class. Unknown or missing themes fall
 * back to the neutral card rather than an unstyled one, so a new tool added to
 * pricing.ts without a matching class still renders correctly.
 */
const TOOL_TONE: Record<string, string> = {
  orange: 'card-tool card-tool--orange',
  blue: 'card-tool card-tool--blue',
  purple: 'card-tool card-tool--purple',
  teal: 'card-tool card-tool--teal',
  pink: 'card-tool card-tool--pink',
  red: 'card-tool card-tool--red',
};
function toolToneClass(theme?: string): string {
  return (theme && TOOL_TONE[theme]) || 'card';
}

/**
 * "Main tier" dashboard card.
 *
 * Per-tool colour returned 2026-08-13 (owner's call, after comparing against
 * EcomAlati). The wash comes from `.card-tool--<hue>`; the TEXT still sits on
 * `--panel`, so every contrast measurement taken during the redesign still
 * holds — see the long comment on `.card-tool` in globals.css for why it is a
 * wash rather than a fully painted card.
 */
export function MainToolCard({
  icon,
  label,
  description,
  cost,
  benefits,
  href,
  soon,
  theme,
  showCost = true,
  className,
}: ToolCardProps & { benefits?: string[]; className?: string }) {
  const card = (
    <div className={cn(toolToneClass(theme), 'h-full', href && 'card--lift', soon && 'opacity-80')}>
      <div className="flex items-start justify-between gap-3">
        <ToolIcon icon={icon} />
        {soon ? (
          <span className="badge badge--muted shrink-0">USKORO</span>
        ) : showCost ? (
          <span className="badge shrink-0">{creditsLabel(cost)}</span>
        ) : null}
      </div>
      <h3 className="font-display mt-4 text-xl font-bold text-txt-hi">{label}</h3>
      <p className="mt-1 text-sm text-txt-mid">{description}</p>
      {benefits && benefits.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-txt-mid">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} aria-hidden="true" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={cn('block rounded-card focus-ring', className)}>
        {card}
      </Link>
    );
  }
  return <div className={className}>{card}</div>;
}

/**
 * "Utility tier" dashboard card — same neutral `.card` as the main tier, just
 * laid out as a compact horizontal row for a denser grid.
 */
export function UtilityToolCard({
  icon,
  label,
  description,
  cost,
  href,
  soon,
  showCost = true,
}: ToolCardProps) {
  const card = (
    <div className={cn('card flex items-center gap-4', href && 'card--lift', soon && 'opacity-80')}>
      <ToolIcon icon={icon} />
      <div className="min-w-0 flex-1">
        <h4 className="font-medium text-txt-hi">{label}</h4>
        <p className="mt-0.5 text-xs text-txt-mid">{description}</p>
      </div>
      {soon ? (
        <span className="badge badge--muted shrink-0">USKORO</span>
      ) : showCost ? (
        <span className="badge shrink-0">{creditsLabel(cost)}</span>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-card focus-ring">
        {card}
      </Link>
    );
  }
  return card;
}
