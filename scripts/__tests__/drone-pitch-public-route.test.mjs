import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import { buildAgenticGraphRedirects } from '../production-pages-routing.mjs'
import { productionMirrorArtifactEntries } from '../production-mirror-artifact-entries.mjs'

const root = new URL('../../cloudflare/pages/pitch/agentic-drone-as-a-service/', import.meta.url)
test('public pitch keeps nested assets local, anchors valid and downloads available', async () => {
  const html = await fs.readFile(new URL('index.html', root), 'utf8')
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(id), `missing anchor ${id}`)
  for (const [, value] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(?:#|https?:|data:)/.test(value)) continue
    assert.ok((await fs.stat(new URL(value, root))).size > 0, value)
  }
  assert.equal([...html.matchAll(/<details\b/g)].length, 5)
  assert.equal([...html.matchAll(/class="demo-step(?: active)?"/g)].length, 5)
  assert.match(html, /href="pilot-brief.md" download/)
  assert.doesNotMatch(html, /<(?:script|iframe)[^>]+(?:src="https?:|src="\/\/)/)
  for (const file of ['index.html', 'styles.css', 'app.js', 'assets/warehouse.webp', 'pilot-brief.md']) {
    assert.ok((await fs.stat(new URL(file, root))).size < 500_000, file)
  }
})
test('pitch route and release artifact are scoped to the requested pitch', () => {
  const existing = '/pitch/other /other 302\n'
  const routes = buildAgenticGraphRedirects({ existing, rootFiles: [] })
  assert.match(routes, /^\/pitch\/agentic-drone-as-a-service \/pitch\/agentic-drone-as-a-service\/ 308$/m)
  assert.match(routes, /^\/pitch\/other \/other 302$/m)
  assert.doesNotMatch(routes, /^\/pitch\/\*/m)
  assert.equal(buildAgenticGraphRedirects({ existing: routes, rootFiles: [] }), routes)
  assert.ok(productionMirrorArtifactEntries.includes('pitch/agentic-drone-as-a-service'))
  assert.ok(!productionMirrorArtifactEntries.includes('pitch'))
})
