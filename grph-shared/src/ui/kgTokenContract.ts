import { hashStringToHex } from '../hash/stringHash.js'

export type KgTheme = 'light' | 'dark' | 'black'
export type KgTokenType = 'color' | 'dimension' | 'number' | 'shadow'
export type KgTokenDef = {
  name: string
  cssVar: `--kg-${string}`
  type: KgTokenType
  purpose: string
  light: string
  dark: string
  black: string
  references?: Partial<Record<KgTheme, string>>
}
export const KG_TOKEN_SOURCE = 'grph-shared/src/ui/kgTokens.ts'
export const KG_TOKEN_LIMITS = Object.freeze({ definitions: 256, depth: 16, bytes: 65536 })
const themes: KgTheme[] = ['light', 'dark', 'black']
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const fail = (path: string, reason: string): never => { throw new Error(`${path}: ${reason}`) }
const plain = (value: unknown): value is Record<string, unknown> => !!value
  && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))

/** Deliberately finite native color subset. Unsupported colors are never guessed. */
export function parseKgColor(value: string): [number, number, number, number] | null {
  const text = value.trim()
  if (/^#[0-9a-f]{3,4}$/i.test(text)) return parseKgColor('#' + [...text.slice(1)].map(c => c + c).join(''))
  if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(text)) {
    return [parseInt(text.slice(1, 3), 16), parseInt(text.slice(3, 5), 16),
      parseInt(text.slice(5, 7), 16), text.length === 9 ? parseInt(text.slice(7, 9), 16) / 255 : 1]
  }
  const rgb = /^(rgb|rgba)\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?|\.\d+))?\s*\)$/i.exec(text)
  if (!rgb || (rgb[1].toLowerCase() === 'rgba') !== (rgb[5] !== undefined)) return null
  const values = [Number(rgb[2]), Number(rgb[3]), Number(rgb[4]), Number(rgb[5] ?? 1)]
  if (values.slice(0, 3).some(v => v > 255) || values[3] > 1) return null
  return values as [number, number, number, number]
}

const numeric = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/
const dimension = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vh|vw)$/
function validLiteral(type: KgTokenType, value: string): boolean {
  if (type === 'color') return parseKgColor(value) !== null
  if (type === 'number') return numeric.test(value) && Number.isFinite(Number(value))
  if (type === 'dimension') return dimension.test(value) && Number.isFinite(parseFloat(value))
  const shadow = /^(?:inset )?((?:-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)? ){2,4})(.+)$/.exec(value)
  const lengths = shadow?.[1].trim().split(' ') ?? []
  return !!shadow && lengths.every(v => v === '0' || dimension.test(v) && Number.isFinite(parseFloat(v)))
    && (lengths.length < 3 || parseFloat(lengths[2]) >= 0)
    && parseKgColor(shadow[2]) !== null
}

export function boundKgTokenOutput(text: string): string {
  if (new TextEncoder().encode(text).length > KG_TOKEN_LIMITS.bytes) fail('tokens', 'output exceeds 64 KiB')
  return text
}

/** Validate the whole input before any serializer or filesystem effect is allowed. */
export function resolveKgTokens(input: readonly KgTokenDef[]) {
  if (!Array.isArray(input) || input.length === 0 || input.length > KG_TOKEN_LIMITS.definitions) {
    fail('tokens', 'expected 1..256 definitions')
  }
  const byName = new Map<string, KgTokenDef>()
  const variables = new Set<string>()
  for (const [index, token] of input.entries()) {
    const path = `tokens[${index}]`
    if (!plain(token)) fail(path, 'expected a plain definition')
    if (Object.keys(token).some(k => !['name', 'cssVar', 'type', 'purpose', 'light', 'dark', 'black', 'references'].includes(k))) fail(path, 'unknown field')
    if (typeof token.name !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(token.name)) fail(path, 'invalid name')
    if (token.cssVar !== `--kg-${token.name}`) fail(path, 'CSS variable must match name')
    if (byName.has(token.name) || variables.has(token.cssVar)) fail(path, 'duplicate name or CSS variable')
    if (!['color', 'dimension', 'number', 'shadow'].includes(token.type)) fail(path, 'unsupported type')
    if (typeof token.purpose !== 'string' || !token.purpose.trim() || token.purpose.length > 512 || /[\u0000-\u001f]/.test(token.purpose)) fail(path, 'invalid purpose')
    if (token.references !== undefined && (!plain(token.references)
      || Object.keys(token.references).some(k => !themes.includes(k as KgTheme)))) fail(path, 'invalid references')
    for (const theme of themes) {
      const value = token[theme], ref = token.references?.[theme]
      if (typeof value !== 'string' || value.length > 512) fail(`${path}.${theme}`, 'invalid value')
      if (ref !== undefined) {
        if (typeof ref !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(ref)) fail(`${path}.${theme}`, 'invalid reference name')
        const prefix = `var(--kg-${ref}`
        const suffix = value.slice(prefix.length)
        if (!value.startsWith(prefix) || !(suffix === ')' || suffix.startsWith(', ') && suffix.endsWith(')')
          && validLiteral(token.type, suffix.slice(2, -1)))) fail(`${path}.${theme}`, 'reference and CSS expression disagree')
      } else if (!validLiteral(token.type, value)) fail(`${path}.${theme}`, 'invalid literal or undeclared reference')
    }
    byName.set(token.name, token)
    variables.add(token.cssVar)
  }
  const resolve = (name: string, theme: KgTheme, chain: string[]): string => {
    if (chain.includes(name)) fail(`tokens.${name}.${theme}`, 'reference cycle')
    if (chain.length >= KG_TOKEN_LIMITS.depth) fail(`tokens.${name}.${theme}`, 'reference depth exceeds 16')
    const token = byName.get(name) ?? fail(`tokens.${name}.${theme}`, 'missing reference')
    const ref = token.references?.[theme]
    if (!ref) return token[theme]
    if (!byName.has(ref)) fail(`tokens.${name}.${theme}`, `missing reference ${ref}`)
    if (byName.get(ref)!.type !== token.type) fail(`tokens.${name}.${theme}`, 'reference type mismatch')
    return resolve(ref, theme, [...chain, name])
  }
  return [...byName.values()].sort((a, b) => compare(a.name, b.name)).map(token => ({
    name: token.name, cssVar: token.cssVar, type: token.type, purpose: token.purpose,
    light: resolve(token.name, 'light', []), dark: resolve(token.name, 'dark', []),
    black: resolve(token.name, 'black', []),
    css: { light: token.light, dark: token.dark, black: token.black },
    references: { light: token.references?.light ?? null, dark: token.references?.dark ?? null,
      black: token.references?.black ?? null },
  }))
}

export function buildKgTokenBundle(definitions: readonly KgTokenDef[]) {
  const tokens = resolveKgTokens(definitions)
  const canonical = JSON.stringify(tokens)
  const bundle = {
    schema: 'agentic-graph/design-tokens/v1' as const,
    source: KG_TOKEN_SOURCE,
    // Cache/provenance fingerprint only; never a signature or an authorization receipt.
    revision: `fnv1a32:${hashStringToHex(canonical)}`,
    tokens,
  }
  boundKgTokenOutput(JSON.stringify(bundle))
  return bundle
}
export type KgTokenBundle = ReturnType<typeof buildKgTokenBundle>

export function renderKgTokensCss(definitions: readonly KgTokenDef[], theme: KgTheme, selector: string, legacy = false): string {
  if (!themes.includes(theme)) fail('theme', 'unsupported theme')
  if (![':root', ":root[data-theme='dark']", ':root.dark', ':root[data-theme="dark"]',
    ':root.dark, :root[data-theme="dark"]',
    ":root[data-theme='dark'][data-dark-variant='black']",
    ':root[data-theme="dark"][data-dark-variant="black"]'].includes(selector)) fail('selector', 'unsupported selector')
  const bundle = buildKgTokenBundle(definitions)
  const ordered = legacy ? definitions.map(t => bundle.tokens.find(resolved => resolved.name === t.name)!) : bundle.tokens
  return boundKgTokenOutput(`${selector}${legacy ? '' : ' '}{\n${ordered.map(t => `  ${t.cssVar}: ${t.css[theme]};`).join('\n')}\n}\n`)
}

export function serializeKgTokens(definitions: readonly KgTokenDef[], target: 'css' | 'json' | 'typescript'): string {
  const bundle = buildKgTokenBundle(definitions)
  const json = JSON.stringify(bundle, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  if (target === 'json') return boundKgTokenOutput(json + '\n')
  if (target === 'typescript') return boundKgTokenOutput(`// Generated from ${bundle.source}; ${bundle.revision}\nexport const designTokens = ${json} as const;\n`)
  if (target !== 'css') fail('target', 'unsupported export target')
  return boundKgTokenOutput(`/* Generated from ${bundle.source}; ${bundle.revision} */\n` + themes.map(theme => {
    const selector = theme === 'light' ? ':root'
      : theme === 'black' ? ':root[data-theme="dark"][data-dark-variant="black"]'
        : ':root.dark, :root[data-theme="dark"]'
    return renderKgTokensCss(definitions, theme, selector)
  }).join(''))
}
