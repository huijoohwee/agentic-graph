/** Application typography, measured from the Markdown dashboard reference.
 * CSS, DOM controls, canvas labels and generated viewers share this owner.
 * Imported document styles and world-space text retain their source dimensions.
 */
import { UI_FONT_SANS, UI_FONT_MONO } from './fontStacks.js'
export { UI_FONT_SANS, UI_FONT_MONO } from './fontStacks.js'

export const UI_TEXT_SCALE = {
  xs: { size: 12, line: 16 },
  sm: { size: 14, line: 20 },
  base: { size: 16, line: 24 },
  lg: { size: 18, line: 28 },
  xl: { size: 20, line: 28 },
  '2xl': { size: 24, line: 32 },
  '3xl': { size: 30, line: 36 },
  '4xl': { size: 36, line: 40 },
  '5xl': { size: 48, line: 48 },
} as const

export const UI_TYPOGRAPHY = {
  caption: 'font-sans text-xs',
  body: 'font-sans text-sm',
  heading: 'font-sans text-base font-semibold',
  title: 'font-sans text-3xl font-semibold',
  code: 'font-mono text-xs',
} as const

/** Upgrade persisted pre-token micro sizes while preserving other user choices. */
export function normalizeUiTextClasses(value: string): string {
  return value
    .replace(/\btext-\[(?:8|9|10|11|12)px\]/g, 'text-xs')
    .replace(/\btracking-(?:wide|wider|widest|tight|tighter)\b/g, 'tracking-normal')
}

/** Emitted with the existing token CSS build; never maintain a second CSS copy. */
export function buildUiTypographyCss(): string {
  const scale = Object.entries(UI_TEXT_SCALE).flatMap(([name, value]) => [
    `  --kg-text-${name}: ${value.size / 16}rem;`,
    `  --kg-text-${name}-line: ${value.line / 16}rem;`,
  ])
  return [
    '/* Generated application typography: grph-shared/src/ui/typography.ts */',
    ':root {',
    `  --kg-font-sans: ${UI_FONT_SANS};`,
    `  --kg-font-mono: ${UI_FONT_MONO};`,
    ...scale,
    '}',
    '',
  ].join('\n')
}
