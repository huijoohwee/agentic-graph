import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))

test('runtime-readiness demo has a lean local launcher and keeps optional assets feature-scoped', async () => {
  const graph = await readJson('../../package.json')
  const canvas = await readJson('../../canvas/package.json')
  const demo = await readFile(new URL('../../docs/workspace-seeds/demo.md', import.meta.url), 'utf8')
  const entry = await readFile(new URL('../../docs/81rv10-production-entry.md', import.meta.url), 'utf8')
  const launcher = await readFile(new URL('../run-runtime-readiness-demo.mjs', import.meta.url), 'utf8')
  const picker = await readFile(new URL('../../canvas/src/features/agentic-os/LiveCanvasHeroPromptPresetPicker.tsx', import.meta.url), 'utf8')
  const demoSource = await readFile(new URL('../../canvas/src/features/agentic-os/liveCanvasHeroDemoSource.ts', import.meta.url), 'utf8')
  const activation = await readFile(new URL('../../canvas/src/features/agentic-os/activateLiveCanvasHeroDemo.ts', import.meta.url), 'utf8')

  assert.equal(graph.scripts['demo:runtime-readiness'], 'node ./scripts/run-runtime-readiness-demo.mjs')
  assert.match(launcher, /agentic-canvas-os', 'docs'/u)
  assert.match(launcher, /VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT: sharedDocsRoot/u)
  assert.match(launcher, /PROMPT-PRESETS\.md/u)
  assert.equal(canvas.scripts['dev:docs'], 'vite --configLoader runner')
  assert.match(canvas.scripts['predev:docs'], /prepare:linked-packages/u)
  assert.doesNotMatch(canvas.scripts['predev:docs'], /prepare:(?:litert-assets|xr-v2-depth-assets)/u)
  assert.match(canvas.scripts.predev, /prepare:litert-assets/u)
  assert.match(canvas.scripts.predev, /prepare:xr-v2-depth-assets/u)
  assert.match(canvas.scripts.prebuild, /prepare:litert-assets/u)
  assert.match(canvas.scripts.prebuild, /prepare:xr-v2-depth-assets/u)
  assert.match(demo, /id: production-runtime-readiness\s+title: Production Runtime Readiness/u)
  assert.match(demo, /demo_only_prompt:/u)
  assert.doesNotMatch(demo, /id: production-runtime-readiness[\s\S]{0,500}source_path:/u)
  assert.match(picker, /loadLiveCanvasHeroDemos/u)
  assert.match(picker, /data-kg-prompt-preset-activation="demo-only"/u)
  assert.match(demoSource, /demoOnlyPrompt/u)
  assert.match(activation, /prompt_source: demo\.demoOnlyPrompt \? LIVE_CANVAS_HERO_DEMO_SOURCE/u)
  assert.equal((entry.match(/The Graph-owned \*\*Production Runtime Readiness · Demo only\*\* option/gu) ?? []).length, 1)
  assert.match(entry, /Demo creates and opens its\s+own local `docs\/demos\/production-runtime-readiness\/<session>\/demo\.md`/u)
})
