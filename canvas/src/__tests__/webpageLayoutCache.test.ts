import assert from 'node:assert/strict'
import { clearCachedWebpageLayoutSnapshots, getCachedWebpageLayoutSnapshot, setCachedWebpageLayoutSnapshot } from '@/lib/websites/webpageLayoutCache'

import type { WebpageLayoutSnapshot } from '@/lib/websites/webpageLayoutExport'

export function testWebpageLayoutCacheEvictsOldest() {
  clearCachedWebpageLayoutSnapshots()

  const mk = (n: number): WebpageLayoutSnapshot =>
    ({
      meta: { kind: 'layout', title: `t${n}`, href: `https://example.invalid/${n}`, viewport: { w: 1, h: 1 }, scroll: { x: 0, y: 0, height: 1 }, ts: n },
      elements: [],
    }) as unknown as WebpageLayoutSnapshot

  for (let i = 1; i <= 9; i += 1) {
    setCachedWebpageLayoutSnapshot(`https://example.invalid/${i}`, mk(i), 'layout:v1')
  }

  if (getCachedWebpageLayoutSnapshot('https://example.invalid/1', 'layout:v1')) throw new Error('expected oldest entry to be evicted')
  if (!getCachedWebpageLayoutSnapshot('https://example.invalid/2', 'layout:v1')) throw new Error('expected entry 2 to remain')
  if (!getCachedWebpageLayoutSnapshot('https://example.invalid/9', 'layout:v1')) throw new Error('expected newest entry to remain')
}

export function testWebpageLayoutCacheSeparatesUrlAndOptions(): void {
  clearCachedWebpageLayoutSnapshots()
  try {
    const pairs: [string, string | undefined][] = [
      ['https://example.invalid/product', 'layout:v1'],
      ['https://example.invalid/product::layout:v1', undefined],
      ['https://example.invalid/product::detail', 'layout:v1'],
      ['https://example.invalid/product', 'detail::layout:v1'],
      ['https://example.invalid/product', undefined],
    ]
    const snapshots = pairs.map(([href], index) => ({
      meta: { kind: 'layout', title: `Product ${index}`, href, viewport: { w: 1, h: 1 }, scroll: { x: 0, y: 0, height: 1 }, ts: index },
      elements: [],
    }) as unknown as WebpageLayoutSnapshot)
    pairs.forEach(([url, options], index) => setCachedWebpageLayoutSnapshot(url, snapshots[index], options))
    pairs.forEach(([url, options], index) => {
      assert.equal(getCachedWebpageLayoutSnapshot(url, options), snapshots[index], `cache entry ${index} must retain its own snapshot`)
    })
    assert.equal(getCachedWebpageLayoutSnapshot(' https://example.invalid/product ', ' layout:v1 '), snapshots[0])
    assert.equal(getCachedWebpageLayoutSnapshot(pairs[4][0], ''), snapshots[4])
    assert.equal(getCachedWebpageLayoutSnapshot('  ', 'layout:v1'), null)
    clearCachedWebpageLayoutSnapshots()
    for (const [url, options] of pairs) assert.equal(getCachedWebpageLayoutSnapshot(url, options), null)
  } finally { clearCachedWebpageLayoutSnapshots() }
}
