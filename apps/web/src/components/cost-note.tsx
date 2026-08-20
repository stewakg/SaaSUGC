import { creditsLabel } from '@adgen/core/pricing';

/**
 * What a job will cost, said once and quietly.
 *
 * Replaces the accent-framed box every wizard used to render in its footer
 * (`rounded-control border border-accent-ring bg-accent-soft` + accent text).
 * That box wore the brand colour — the loudest thing the design system has —
 * on every step of every tool, including the ones where the customer is
 * choosing a voice and has not decided anything yet. The owner's word for it
 * was that it stings the eye, and he is right: the price is not the thing we
 * are selling, it is the thing we take at the end.
 *
 * So it is now text the colour of metadata, and JobWizard only renders it on
 * the LAST step — the moment before the button that actually spends. Nothing
 * is hidden: the number is on screen when it is about to be taken, and the
 * balance lives in the header where a wallet belongs.
 */
export function CostNote({
  cost,
  charged = false,
  suffix,
}: {
  cost: number;
  /** After a successful run: says the credits are gone, in the same quiet voice. */
  charged?: boolean;
  /** Per-tool tail, e.g. matrix's "za 3 varijante". */
  suffix?: string;
}) {
  return (
    <p className="truncate text-xs text-txt-low">
      <span className="font-mono tabular text-txt-mid">{creditsLabel(cost)}</span>
      {suffix ? ` ${suffix}` : ''}
      {charged ? ' · naplaćeno' : ''}
    </p>
  );
}
