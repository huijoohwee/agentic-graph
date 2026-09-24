import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { AG_TOKEN_DEFS, extractKgCssVarsFromCssText } from '@/lib/ui/tokens-ssot'

const readUtf8 = (absPath: string): string => {
  return fs.readFileSync(absPath, { encoding: 'utf8' })
}

export const testKgTokenSsotIndexCssDefinesAllVars = () => {
  const root = process.cwd()
  const cssPath = path.resolve(root, 'src', 'index.css')
  const cssText = readUtf8(cssPath)
  if (!cssText.includes("@import './styles/kgTokens.generated.css'")) throw new Error('Expected index.css to load the generated token owner')
  const tokenCssText = readUtf8(path.resolve(root, 'src', 'styles', 'kgTokens.generated.css'))
  const vars = extractKgCssVarsFromCssText(cssText + '\n' + tokenCssText)
  for (let i = 0; i < AG_TOKEN_DEFS.length; i += 1) {
    const cssVar = AG_TOKEN_DEFS[i].cssVar
    if (!vars.has(cssVar)) {
      throw new Error(`Expected imported application token CSS to define ${cssVar}`)
    }
  }
}


export async function testKgTokenValidationAndAliases() {
  const { resolveKgTokens, buildKgTokenBundle } = await import('@/lib/ui/tokens-ssot')
  const base = { name: 'base', cssVar: '--kg-base' as const, type: 'color' as const,
    purpose: 'Base surface', light: '#ffffff', dark: '#000000', black: '#0a0a0a' }
  const alias = { ...base, name: 'alias', cssVar: '--kg-alias' as const,
    light: 'var(--kg-base)', dark: 'var(--kg-base, #000000)', black: 'var(--kg-base)',
    references: { light: 'base', dark: 'base', black: 'base' } }
  const resolved = resolveKgTokens([alias, base])
  assert.equal(resolved[0].light, '#ffffff')
  assert.equal(resolved[0].dark, '#000000')
  assert.equal(resolved[0].black, '#0a0a0a')
  assert.equal(buildKgTokenBundle(AG_TOKEN_DEFS).tokens.length, AG_TOKEN_DEFS.length)
  for (const [definitions, message] of [
    [[base, base], /duplicate/],
    [[{ ...base, light: 'url(https://invalid.example)' }], /invalid literal/],
    [[{ ...base, light: 'rgb(999,0,0)' }], /invalid literal/],
    [[{ ...base, light: '#fff;display:none' }], /invalid literal/],
    [[alias], /missing reference/],
    [[{ ...base, type: 'number', light: '2', dark: '3', black: '4' }, alias], /type mismatch/],
    [[{ ...base, light: 'var(--kg-alias)', references: { light: 'alias' } }, alias], /cycle/],
    [[{ ...alias, light: 'var(--kg-base-bad)' }, base], /disagree/],
    [[{ ...base, cssVar: '--kg-other' }], /match name/],
    [[{ ...base, purpose: '' }], /purpose/],
    [[{ ...base, type: 'shadow', light: '0 0 -1px #fff', dark: '0 0 #000' }], /invalid literal/],
    [[{ ...base, references: { wrong: 'base' } }], /references/],
    [Array.from({ length: 257 }, () => base), /1..256/],
  ] as const) assert.throws(() => resolveKgTokens(definitions as unknown as typeof AG_TOKEN_DEFS), message)
  const deep = Array.from({ length: 17 }, (_, i) => ({ ...base, name: `token-${i}`, cssVar: `--kg-token-${i}` as const,
    ...(i < 16 ? { light: `var(--kg-token-${i + 1})`, references: { light: `token-${i + 1}` } } : {}) }))
  assert.throws(() => resolveKgTokens(deep), /depth/)
}

export async function testKgTokenExportsAreDeterministicAndBounded() {
  const { serializeKgTokens, buildKgTokenBundle, buildKgTokensCssText } = await import('@/lib/ui/tokens-ssot')
  const reversed = [...AG_TOKEN_DEFS].reverse()
  for (const target of ['css', 'json', 'typescript'] as const) {
    const result = serializeKgTokens(AG_TOKEN_DEFS, target)
    assert.equal(result, serializeKgTokens(reversed, target))
    assert.ok(new TextEncoder().encode(result).length <= 65536)
    assert.ok(result.includes('grph-shared/src/ui/kgTokens.ts'))
  }
  const bundle = JSON.parse(serializeKgTokens(AG_TOKEN_DEFS, 'json'))
  assert.deepEqual(bundle, buildKgTokenBundle(AG_TOKEN_DEFS))
  const typescript = serializeKgTokens(AG_TOKEN_DEFS, 'typescript')
  const tsPayload = typescript.slice(typescript.indexOf(' = ') + 3).replace(/ as const;\n$/, '')
  assert.deepEqual(JSON.parse(tsPayload), bundle)
  const css = serializeKgTokens(AG_TOKEN_DEFS, 'css')
  for (const token of bundle.tokens) for (const theme of ['light', 'dark', 'black'] as const) {
    assert.ok(css.includes(`${token.cssVar}: ${token.css[theme]};`))
  }
  assert.throws(() => serializeKgTokens(AG_TOKEN_DEFS, 'native' as 'css'), /unsupported/)
  assert.throws(() => buildKgTokensCssText('light', { selector: ':root { color: red; }' }), /selector/)
  const excessive = Array.from({ length: 256 }, (_, i) => ({ ...AG_TOKEN_DEFS[0], name: `token-${i}`,
    cssVar: `--kg-token-${i}` as const, purpose: 'x'.repeat(512) }))
  assert.throws(() => serializeKgTokens(excessive, 'json'), /64 KiB/)
  const boundary = Array.from({ length: 70 }, (_, i) => ({ name: `token-${i}`,
    cssVar: `--kg-token-${i}` as `--kg-${string}`, type: 'color' as const, purpose: 'x'.repeat(512),
    light: '#ffffff', dark: '#000000', black: '#0a0a0a' }))
  assert.ok(new TextEncoder().encode(JSON.stringify(buildKgTokenBundle(boundary))).length <= 65536)
  const generated = [
    buildKgTokensCssText('light', { selector: ':root' }),
    buildKgTokensCssText('dark', { selector: ":root[data-theme='dark']" }),
    buildKgTokensCssText('black', { selector: ":root[data-theme='dark'][data-dark-variant='black']" }),
  ].join('\n')
  assert.equal(AG_TOKEN_DEFS.length, 49)
  assert.ok(generated.includes(":root[data-theme='dark'][data-dark-variant='black']"))
  assert.equal(generated, readUtf8(path.resolve(process.cwd(), 'src/styles/kgTokens.generated.css')))
}
