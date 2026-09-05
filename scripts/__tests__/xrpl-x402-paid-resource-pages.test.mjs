import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { checkXrplX402PagesCandidate } from '../check-xrpl-x402-pages-candidate.mjs'

test('published paid-resource Pages closure resolves without package dependencies', async () => {
  const sourcePath = new URL(
    '../../grph-shared/dist/payments/agenticCommercePaidResourceSsot.js',
    import.meta.url,
  )
  const sourceBefore = await readFile(sourcePath, 'utf8')
  assert.doesNotMatch(sourceBefore, /\bfrom\s*["'](?!\.)|\bimport\s*\(\s*["'](?!\.)/u)

  const result = await checkXrplX402PagesCandidate()
  assert.equal(result.ok, true)
  assert.equal(result.copiedPaidResourceSsot, true)
  assert.ok(result.bundleBytes > 0)
  assert.equal(await readFile(sourcePath, 'utf8'), sourceBefore)
})
