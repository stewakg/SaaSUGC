import Link from 'next/link';
import { creditsLabel } from '@adgen/core/pricing';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toolGradientClass } from '@/lib/tool-theme';
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
 * Big vivid gradient card for a "main tier" tool — EcomAlati-style: white
 * icon badge, bold title, one-line description, 3 concrete benefit bullets.
 */
export function MainToolCard({
  icon,
  theme,
  label,
  description,
  cost,
  benefits,
  href,
  soon,
}: ToolCardProps & { theme?: string; benefits?: string[] }) {
  const content = (
    <div className={cn('relative overflow-hidden rounded-2xl p-6 shadow-lg', toolGradientClass(theme))}>
      <div className="flex items-start justify-between gap-3">
        <ToolIcon icon={icon} />
        {soon ? (
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-white backdrop-blur-sm">
            Uskoro
          </span>
        ) : (
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            {creditsLabel(cost)}
          </span>
        )}
      </div>
      <h3 className="font-display mt-4 text-xl font-bold text-white">{label}</h3>
      <p className="mt-1 text-sm text-white/80">{description}</p>
      {benefits && benefits.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-white/90">
              <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition hover:-translate-y-0.5 hover:shadow-xl">
        {content}
      </Link>
    );
  }
  return content;
}

/** Compact horizontal row for a "utility tier" tool — secondary, less visual weight than MainToolCard. */
export function UtilityToolCard({ icon, label, description, cost, href, soon }: ToolCardProps) {
  const content = (
    <div className="flex items-center gap-4 rounded-xl border border-white/5 bg-ink-850/80 p-4 backdrop-blur transition hover:border-white/10">
      <ToolIcon icon={icon} />
      <div className="min-w-0 flex-1">
        <h4 className="font-medium text-zinc-100">{label}</h4>
        <p className="mt-0.5 text-xs text-zinc-400">{description}</p>
      </div>
      {soon ? (
        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
          Uskoro
        </span>
      ) : (
        <span className="badge shrink-0">{creditsLabel(cost)}</span>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
