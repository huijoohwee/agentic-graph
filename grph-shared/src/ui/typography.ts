/** Application typography, measured from the Markdown dashboard reference.
 * CSS, DOM controls, canvas labels and generated viewers share this owner.
 * Imported document styles and world-space text retain their source dimensions.
 */
import { centralTokenPixels } from './fontStacks.js'
import profile from './graph-profile.json' with { type: 'json' }
export { UI_FONT_SANS, UI_FONT_MONO } from './fontStacks.js'

export const UI_TEXT_SCALE = Object.fromEntries(
  ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'].map(name => [name, {
    size: centralTokenPixels(`--kg-text-${name}`), line: centralTokenPixels(`--kg-text-${name}-line`),
  }]),
) as Record<'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl', { size: number; line: number }>

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
  const rows = profile.tokens.filter(token => token.cssVar.startsWith('--kg-text-')
    && /^(?:text-(?:xs|sm|base|lg|xl|[2-5]xl)(?:-line)?)$/.test(token.key)
    || ['--kg-font-sans', '--kg-font-mono'].includes(token.cssVar))
    .map(token => `  ${token.cssVar}: ${token.values.light};`)
  return ['/* Generated from the pinned Design System typography profile. */', ':root {', ...rows, '}', ''].join('\n')
}
