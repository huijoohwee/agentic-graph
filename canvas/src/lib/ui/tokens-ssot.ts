export * from 'grph-shared/ui/kgTokens'

import type { KgTheme, KgTokenDef } from 'grph-shared/ui/kgTokens'
import { AG_TOKEN_DEFS } from 'grph-shared/ui/kgTokens'

export function buildKgTokensCssText(theme: KgTheme, opts?: { selector?: string }): string {
  const selector = String(opts?.selector || ':root')
  const lines: string[] = []
  lines.push(`${selector} {`)
  for (let i = 0; i < AG_TOKEN_DEFS.length; i += 1) {
    const def: KgTokenDef = AG_TOKEN_DEFS[i]!
    const value = theme === 'dark' ? def.dark : def.light
    lines.push(`  ${def.cssVar}: ${value};`)
  }
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

export const readRootCssStateKey = (): string => {
  if (typeof document === 'undefined') return ''
  const root = document.documentElement
  const theme = root.getAttribute('data-theme') || ''
  const className = root.className || ''
  const style = root.getAttribute('style') || ''
  return `${theme}|${className}|${style}`
}
