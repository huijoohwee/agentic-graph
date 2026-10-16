import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = (path: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), path), 'utf8')

test('XR keeps adaptive DPR sampling after overlay scheduling is disabled', () => {
  const graph = source('../lib/three/ThreeGraph.impl.tsx')
  const frameSync = source('../lib/three/ThreeGraphXr.tsx')
  assert.match(graph, /<OverlayFrameSync enabled=\{active && mode !== 'xr'\} scheduleRef=\{scheduleRef\} onResolutionChange=\{setCanvasDpr\} \/>/)
  const sampling = frameSync.indexOf('const ratio = resolutionBudget.sample(')
  const overlayGate = frameSync.indexOf('if (!enabled) return')
  assert.ok(sampling >= 0, 'the shared frame hook must sample adaptive DPR')
  assert.ok(overlayGate > sampling, 'overlay scheduling must be gated after DPR sampling')
})
