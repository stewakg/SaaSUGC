/**
 * Per-tool accent color for the big "main tier" dashboard cards (EcomAlati-
 * style: each tool gets its own vivid gradient, not one uniform theme).
 * `theme` is the semantic key from JobDescriptor (packages/core) — kept out
 * of @adgen/core since it's presentation-only.
 */
const THEME_GRADIENTS: Record<string, string> = {
  orange: 'from-orange-500 to-amber-600',
  blue: 'from-blue-500 to-blue-700',
  purple: 'from-purple-500 to-violet-600',
  teal: 'from-teal-400 to-emerald-600',
  pink: 'from-pink-500 to-fuchsia-600',
  red: 'from-red-500 to-rose-600',
};

const DEFAULT_GRADIENT = 'from-zinc-600 to-zinc-800';

export function toolGradientClass(theme?: string): string {
  return `bg-gradient-to-br ${(theme && THEME_GRADIENTS[theme]) || DEFAULT_GRADIENT}`;
}
