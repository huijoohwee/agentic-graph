import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clampTimelineTransportValue, resolveTimelineTransportPlayheadScrollLeft, resolveTimelineTransportPlaybackRate, resolveTimelineTransportZoom } from '../timelineTransportMath'

test('store-free timeline math preserves finite bounds, rates and zoom', () => {
  assert.equal(clampTimelineTransportValue(NaN, 2, 9), 2)
  assert.equal(clampTimelineTransportValue(12, 2, 9), 9)
  assert.equal(resolveTimelineTransportPlaybackRate(1.5, 1), 1.5)
  assert.equal(resolveTimelineTransportPlaybackRate(3, 1), 1)
  assert.equal(resolveTimelineTransportZoom(100), 6)
  assert.equal(resolveTimelineTransportPlayheadScrollLeft({ contentWidth: 1000, viewportWidth: 200, max: 10, position: 5 }), 400)
})

test('native Gantt ruler bundles without Graph application stores', async () => {
  const root = fileURLToPath(new URL('../../../../../', import.meta.url))
  const esbuild = createRequire(path.join(root, 'package.json'))('esbuild')
  const result = await esbuild.build({ absWorkingDir: root, stdin: {
    contents: "export { VideoSequenceTimelineRuler } from './canvas/src/components/timeline/VideoSequenceTimelineRuler'",
    resolveDir: root, loader: 'tsx',
  }, bundle: true, write: false, format: 'esm', platform: 'browser', minify: true, metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty' },
    alias: { '@': path.join(root, 'canvas/src'), 'grph-shared': path.join(root, 'grph-shared/src') }, logLevel: 'silent' })
  assert(result.outputFiles[0].contents.length < 200000)
  assert(!Object.keys(result.metafile.inputs).some(file => /useGraphStore|workspace-seeds|maplibre-gl|elkjs/.test(file)))
})


test('native ticks retain clocks and entered dates without inventing ordinal durations', async () => {
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { VideoSequenceTimelineRulerTicks } = await import('../VideoSequenceTimelineRulerTicks')
  const render = (label: string) => renderToStaticMarkup(React.createElement(VideoSequenceTimelineRulerTicks, { displayTicks: [{ label, minutes: 1, percent: 0 }] }))
  assert.match(render('0:01'), /dateTime="PT1S"/i)
  assert.match(render('2026-11-06'), /dateTime="2026-11-06"/i)
  assert.doesNotMatch(render('Step 1'), /dateTime=/i)
})
