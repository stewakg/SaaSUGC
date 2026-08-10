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
}

/**
 * "Main tier" dashboard card — neutral `.card`, no per-tool colour. Colour
 * carries state (running/done/error/selected), never tool identity, so every
 * card here shares the same look: icon chip, bold title, one-line
 * description, up to 3 benefit bullets, mono/tabular price badge top-right.
 */
export function MainToolCard({
  icon,
  label,
  description,
  cost,
  benefits,
  href,
  soon,
  className,
}: ToolCardProps & { benefits?: string[]; className?: string }) {
  const card = (
    <div className={cn('card h-full', href && 'card--lift', soon && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <ToolIcon icon={icon} />
        {soon ? (
          <span className="badge shrink-0">USKORO</span>
        ) : (
          <span className="badge shrink-0">{creditsLabel(cost)}</span>
        )}
      </div>
      <h3 className="font-display mt-4 text-xl font-bold text-txt-hi">{label}</h3>
      <p className="mt-1 text-sm text-txt-mid">{description}</p>
      {benefits && benefits.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-txt-mid">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={cn('block', className)}>
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
export function UtilityToolCard({ icon, label, description, cost, href, soon }: ToolCardProps) {
  const card = (
    <div className={cn('card flex items-center gap-4', href && 'card--lift', soon && 'opacity-60')}>
      <ToolIcon icon={icon} />
      <div className="min-w-0 flex-1">
        <h4 className="font-medium text-txt-hi">{label}</h4>
        <p className="mt-0.5 text-xs text-txt-mid">{description}</p>
      </div>
      {soon ? (
        <span className="badge shrink-0">USKORO</span>
      ) : (
        <span className="badge shrink-0">{creditsLabel(cost)}</span>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }
  return card;
}
