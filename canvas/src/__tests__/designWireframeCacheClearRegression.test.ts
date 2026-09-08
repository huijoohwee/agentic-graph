import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { buildWebpageLayoutCacheKey, getDesignWebpageWireframePreset } from '@/lib/websites/webpageLayoutPresets'
import { clearCachedWebpageLayoutSnapshots, getCachedWebpageLayoutSnapshot, setCachedWebpageLayoutSnapshot } from '@/lib/websites/webpageLayoutCache'
import type { WebpageLayoutSnapshot } from '@/lib/websites/webpageLayoutExport'

export function testDesignWireframeCacheEpochAffectsLayoutCacheKey() {
  clearCachedWebpageLayoutSnapshots()
  try {
    const url = 'https://example.invalid/wireframe'
    const snapshot = {
      meta: { kind: 'layout', title: 'Wireframe', href: url, viewport: { w: 1, h: 1 }, scroll: { x: 0, y: 0, height: 1 }, ts: 1 },
      elements: [],
    } as unknown as WebpageLayoutSnapshot
    for (const fidelityLevel of [1, 2, 3, 4] as const) {
      const preset = getDesignWebpageWireframePreset({ fidelityLevel })
      const key = buildWebpageLayoutCacheKey(preset, { epoch: 0 })
      const refreshedKey = buildWebpageLayoutCacheKey(preset, { epoch: 1 })
      assert.notEqual(refreshedKey, key)
      assert.equal(buildWebpageLayoutCacheKey(preset, { epoch: 0.5 }), key)
      setCachedWebpageLayoutSnapshot(url, snapshot, key)
      assert.equal(getCachedWebpageLayoutSnapshot(url, key), snapshot)
      assert.equal(getCachedWebpageLayoutSnapshot(url, refreshedKey), null, 'new epoch must miss the old cached layout')
      setCachedWebpageLayoutSnapshot(url, snapshot, refreshedKey)
      assert.equal(getCachedWebpageLayoutSnapshot(url, refreshedKey), snapshot)
      clearCachedWebpageLayoutSnapshots()
      assert.equal(getCachedWebpageLayoutSnapshot(url, key), null)
      assert.equal(getCachedWebpageLayoutSnapshot(url, refreshedKey), null)
    }
  } finally { clearCachedWebpageLayoutSnapshots() }
}

export function testDesignWireframeSettingsExposesClearCache() {
  const filePath = path.resolve(process.cwd(), 'src/features/toolbar/ui/DesignWireframeSettings.tsx')
  let text = ''
  try {
    text = fs.readFileSync(filePath, { encoding: 'utf8' })
  } catch {
    throw new Error(`Expected to read ${filePath}`)
  }
  if (!text.includes('Clear cache')) {
    throw new Error('Expected DesignWireframeSettings to render a Clear cache button')
  }
  if (!text.includes('clearCachedWebpageLayoutSnapshots') || !text.includes('clearWebpageIframeSrcdocCaches')) {
    throw new Error('Expected Clear cache to clear webpage layout + iframe srcdoc caches')
  }
}
