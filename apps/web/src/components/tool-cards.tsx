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
  orange: 'card-tool--orange',
  blue: 'card-tool--blue',
  purple: 'card-tool--purple',
  teal: 'card-tool--teal',
  pink: 'card-tool--pink',
  red: 'card-tool--red',
  green: 'card-tool--green',
  gold: 'card-tool--gold',
};
/**
 * The `.card-tool--<hue>` classes only set custom properties (--tool-strip,
 * --tool-edge …), so they compose with `.card-strip` directly. No hue class
 * means the strip header falls back to a neutral --panel-2 band.
 */
function toolToneClass(theme?: string): string {
  return (theme && TOOL_TONE[theme]) || '';
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
    <div
      className={cn(
        // flex-col + min-h + flex-1 body: every card in a tool grid renders the
        // SAME height (owner, 2026-08-19), with the body's --panel absorbing
        // the slack — not the hue wash, which would read as a taller band.
        'card-strip flex h-full flex-col sm:min-h-[17rem]',
        toolToneClass(theme),
        href && 'card--lift',
        soon && 'opacity-80',
      )}
    >
      {/* Identity hue lives ONLY in this band; body copy sits on --panel. */}
      <div className="card-strip-head">
        <ToolIcon icon={icon} />
        <h3 className="font-display min-w-0 flex-1 truncate text-lg font-bold text-txt-hi">
          {label}
        </h3>
        {soon ? (
          <span className="badge badge--muted shrink-0">USKORO</span>
        ) : showCost ? (
          <span className="badge shrink-0">{creditsLabel(cost)}</span>
        ) : null}
      </div>
      <div className="card-strip-body flex-1">
        <p className="text-sm text-txt-mid">{description}</p>
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
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={cn('block h-full rounded-card focus-ring', className)}>
        {card}
      </Link>
    );
  }
  return <div className={className}>{card}</div>;
}

/**
 * "Utility tier" dashboard card — since 2026-08-19 the SAME strip system as the
 * main tier (owner: "isti sistem, isti kvadratić", different hues), just
 * without the benefits list: the hue wash + icon tile in the header band,
 * description on --panel below. Utilities got their own hues in pricing.ts.
 */
export function UtilityToolCard({
  icon,
  label,
  description,
  cost,
  href,
  soon,
  theme,
  showCost = true,
}: ToolCardProps) {
  const card = (
    <div
      className={cn(
        // Same min-height as MainToolCard — "svi iste veličine" (owner,
        // 2026-08-19): utilities have no benefits list, so without the shared
        // min-h their row rendered visibly shorter than the main row.
        'card-strip flex h-full flex-col sm:min-h-[17rem]',
        toolToneClass(theme),
        href && 'card--lift',
        soon && 'opacity-80',
      )}
    >
      <div className="card-strip-head">
        <ToolIcon icon={icon} />
        <h4 className="font-display min-w-0 flex-1 truncate text-base font-bold text-txt-hi">
          {label}
        </h4>
        {soon ? (
          <span className="badge badge--muted shrink-0">USKORO</span>
        ) : showCost ? (
          <span className="badge shrink-0">{creditsLabel(cost)}</span>
        ) : null}
      </div>
      <div className="card-strip-body flex-1">
        <p className="text-sm text-txt-mid">{description}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full rounded-card focus-ring">
        {card}
      </Link>
    );
  }
  return card;
}
