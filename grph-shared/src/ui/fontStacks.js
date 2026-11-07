// Contract adapter over an immutable, checked Design System runtime projection.
import profile from './design-runtime-profile.json' with { type: 'json' }

/** Generate data only; the full pinned profiles remain the sole editable value owner. */
export function deriveDesignRuntimeProfile(profiles) {
  const values = new Map()
  for (const source of profiles) for (const token of source.tokens) {
    if (!/^--[a-z][a-z0-9-]*$/.test(token.cssVar) || values.has(token.cssVar)) throw new Error('Duplicate or invalid central variable')
    const modes = token.values ? ['light', 'dark', 'black'].map(mode => token.values[mode]) : [token.value]
    if (modes.some(value => typeof value !== 'string')) throw new Error('Missing central value')
    while (modes.length > 1 && modes.at(-1) === modes.at(-2)) modes.pop()
    values.set(token.cssVar, modes)
  }
  return { schema: 'agentic-design-system/runtime-projection/v1', values: Object.fromEntries([...values].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) }
}
export function centralTokenCss(variable, theme = 'light') {
  const modes = profile.values[variable]
  if (!modes || !['light', 'dark', 'black'].includes(theme)) throw new Error(`Unknown central token or mode: ${variable}`)
  return modes[Math.min(['light', 'dark', 'black'].indexOf(theme), modes.length - 1)]
}
export function centralTokenValue(variable, theme = 'light', chain = []) {
  if (chain.includes(variable) || chain.length > 16) throw new Error(`Central token cycle: ${variable}`)
  const value = centralTokenCss(variable, theme)
  const reference = /^var\((--[a-z0-9-]+)\)$/.exec(value)
  return reference ? centralTokenValue(reference[1], theme, [...chain, variable]) : value
}
export function centralTokenPixels(variable) {
  const value = centralTokenValue(variable)
  if (!/^[0-9.]+(?:px|rem)$/.test(value)) throw new Error(`Expected a central length: ${variable}`)
  return parseFloat(value) * (value.endsWith('rem') ? 16 : 1)
}
export const UI_FONT_SANS = centralTokenValue('--agentic-font-sans')
export const UI_FONT_MONO = centralTokenValue('--agentic-font-mono')
export const UI_BODY_FONT_SIZE = centralTokenPixels('--agentic-font-size-body')
export const UI_BODY_LINE_HEIGHT = centralTokenPixels('--agentic-line-height-body')
