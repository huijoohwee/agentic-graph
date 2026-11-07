// Contract adapter over immutable Design System projections; values are never authored here.
import sharedProfile from './shared-ui-profile.json' with { type: 'json' }
import graphProfile from './graph-profile.json' with { type: 'json' }
const shared = new Map(sharedProfile.tokens.map(token => [token.cssVar, token.value]))
const graph = new Map(graphProfile.tokens.map(token => [token.cssVar, token.values]))
export function centralTokenValue(variable, theme = 'light', chain = []) {
  if (chain.includes(variable) || chain.length > 16) throw new Error(`Central token cycle: ${variable}`)
  const value = shared.get(variable) ?? graph.get(variable)?.[theme]
  if (typeof value !== 'string') throw new Error(`Unknown central token: ${variable}`)
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
