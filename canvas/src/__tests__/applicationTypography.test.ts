import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { JSDOM } from 'jsdom'
import { exportGraphAsCenteredSvgMarkup } from '@/lib/graph/graphCenteredSvg'
import { defaultSchema } from '@/lib/graph/schema'
import { UI_FONT_SANS, UI_FONT_MONO, UI_TEXT_SCALE, buildUiTypographyCss, normalizeUiTextClasses } from 'grph-shared/ui/typography'
import { coercePanelTypography } from 'grph-shared/ui/panelTypography'
import { tailwindTextSizeClassToPx } from 'grph-shared/ui/tailwindTextSize'
import { getMarkdownHeadingFontSizePx, getMarkdownHeadingTextSizeClass } from '@/features/markdown/ui/markdownTypography'

export function testApplicationTypographyMatchesDashboardReference() {
  assert.deepEqual(UI_TEXT_SCALE.xs, { size: 12, line: 16 })
  assert.deepEqual(UI_TEXT_SCALE.sm, { size: 14, line: 20 })
  assert.deepEqual(UI_TEXT_SCALE.base, { size: 16, line: 24 })
  assert.deepEqual(UI_TEXT_SCALE['3xl'], { size: 30, line: 36 })
  const generated = fs.readFileSync(path.resolve('src/styles/kgTokens.generated.css'), 'utf8')
  assert.ok(generated.startsWith(buildUiTypographyCss()), 'Generated CSS must match the typography source')
  assert.ok(generated.includes(`--kg-font-sans: ${UI_FONT_SANS}`))
  assert.ok(generated.includes(`--kg-font-mono: ${UI_FONT_MONO}`))
  for (const presentation of [false, true]) for (let depth = 1; depth <= 6; depth++) {
    const args = { depth, presentation }
    assert.equal(getMarkdownHeadingFontSizePx(args), tailwindTextSizeClassToPx(getMarkdownHeadingTextSizeClass(args)),
      'DOM and canvas/export headings must have identical measurements')
  }
}

export function testApplicationTypographyLoadsBeforeBuild() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typography-source-'))
  try {
    const shared = path.join(root, 'node_modules/grph-shared')
    fs.mkdirSync(path.join(shared, 'src/ui'), { recursive: true })
    for (const file of ['package.json', 'src/ui/fontStacks.mjs']) {
      fs.copyFileSync(path.resolve('../grph-shared', file), path.join(shared, file))
    }
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
      "import { UI_FONT_SANS, UI_FONT_MONO } from 'grph-shared/ui/fontStacks'; console.log(JSON.stringify([UI_FONT_SANS, UI_FONT_MONO]))",
    ], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } })
    assert.deepEqual(JSON.parse(output), [UI_FONT_SANS, UI_FONT_MONO])
    assert.equal(fs.existsSync(path.join(shared, 'dist')), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

export function testApplicationTypographyMigratesLegacyPreferences() {
  for (const size of [8, 9, 10, 11, 12]) {
    const value = `font-sans text-[${size}px] tracking-wide`
    assert.equal(normalizeUiTextClasses(value), 'font-sans text-xs tracking-normal')
    assert.equal(normalizeUiTextClasses(normalizeUiTextClasses(value)), normalizeUiTextClasses(value))
    assert.equal(coercePanelTypography({ microLabelTextSizeClass: `text-[${size}px]` }).microLabelTextSizeClass, 'text-xs')
  }
  assert.equal(normalizeUiTextClasses('font-serif text-[15px]'), 'font-serif text-[15px]')
  assert.equal(coercePanelTypography(null).microLabelTextSizeClass, 'text-xs')
}

export function testApplicationTypographyExportsValidSvgFonts() {
  const svg = exportGraphAsCenteredSvgMarkup({
    graphData: { type: 'Graph', nodes: [{ id: 'a', type: 'Entity', label: 'Readable label', x: 0, y: 0, properties: {} }], edges: [] },
    schema: defaultSchema, widthPx: 800, heightPx: 600, includeXmlDeclaration: false,
  })
  assert.ok(svg)
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' })
  try {
    const label = dom.window.document.querySelector('[data-role="node-label"]')
    assert.ok(label)
    assert.equal(label.getAttribute('font-family'), UI_FONT_SANS)
    assert.equal(label.textContent, 'Readable label')
  } finally { dom.window.close() }
}

const sources = (root: string): string[] => fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
  if (['__tests__', 'tests', 'testing'].includes(entry.name)) return []
  const file = path.join(root, entry.name)
  return entry.isDirectory() ? sources(file) : /\.(tsx?|mjs|css)$/.test(file) ? [file] : []
})

export function testApplicationTypographyForbidsLegacyVariants() {
  const violations: string[] = []
  for (const root of ['src', '../grph-shared/src', '../gympgrph/src']) for (const file of sources(path.resolve(root))) {
    if (file.endsWith('/ui/typography.ts') || file.endsWith('/ui/fontStacks.mjs') || file.endsWith('/kgTokens.generated.css')) continue
    const content = fs.readFileSync(file, 'utf8')
    if (/text-\[\d+(?:\.\d+)?(?:px|rem)\]/.test(content)) violations.push(`${file}: use the shared text scale`)
    if (/tracking-(?:wide|wider|widest|tight|tighter)\b|tracking-\[[^\]]+\]/.test(content)) violations.push(`${file}: use normal letter spacing`)
    if (/(?:-apple-system|SFMono-Regular|BlinkMacSystemFont|system-ui|sans-serif)/.test(content)) violations.push(`${file}: import the shared font stack`)
    if (file.endsWith('.css') && /font-size:\s*(?:[0-9]|1[01])px\b/.test(content)) violations.push(`${file}: caption text must use the shared minimum`)
  }
  assert.deepEqual(violations, [], 'Legacy typography must not return through a local override')
}
