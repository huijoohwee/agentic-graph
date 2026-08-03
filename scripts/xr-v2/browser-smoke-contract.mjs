import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const SOURCE_PATHS = Object.freeze([
  ['canvas', 'src', 'App.tsx'],
  ['canvas', 'src', 'features', 'testing', 'XrV2RuntimeSmokePage.tsx'],
  ['canvas', 'scripts', 'run_xr_v2_browser_smoke.mjs'],
  ['canvas', 'scripts', 'verify_xr_v2_browser_smoke.mjs'],
])
const REQUIRED_MARKERS = Object.freeze([
  "from '@/features/xr-v2'",
  'XrV2RuntimeSmokePageLazy',
  '/__smoke__/xr-v2-runtime',
  'data-kg-xr-v2-runtime-smoke',
  'data-kg-xr-v2-runtime-status',
  'data-kg-xr-v2-capability-status',
  'data-kg-xr-v2-capture-status',
  'data-kg-xr-v2-authoring-status',
  "logLabel: 'xr-v2-browser-smoke'",
  "existingServerPolicy: 'forbid'",
  "import('@/features/testing/XrV2RuntimeSmokePage')",
  'knowgrph-xr-v2-browser-smoke/v1',
  'runtimeSchema',
  'xr-v2-browser-smoke.json',
])
const FORBIDDEN_MARKERS = Object.freeze([
  'getUserMedia(',
  'requestSession(',
  'new MediaRecorder',
  '/xr.capture',
  '/xr.author',
])

export function verifyXrV2BrowserSmokeSourceContract(repositoryRoot) {
  const sources = SOURCE_PATHS.map(parts => {
    const path = resolve(repositoryRoot, ...parts)
    if (!existsSync(path)) throw new Error(`expected XR v2 browser source at ${relative(repositoryRoot, path)}`)
    return { path, source: readFileSync(path, 'utf8') }
  })
  const combined = sources.map(entry => entry.source).join('\n')
  for (const marker of REQUIRED_MARKERS) {
    if (!combined.includes(marker)) throw new Error(`expected XR v2 browser smoke marker ${marker}`)
  }
  for (const marker of FORBIDDEN_MARKERS) {
    if (combined.includes(marker)) throw new Error(`expected deterministic XR v2 smoke to avoid ${marker}`)
  }
  for (const entry of sources) {
    const lineCount = entry.source.split(/\r?\n/u).length
    if (lineCount > 600) throw new Error(`${relative(repositoryRoot, entry.path)} exceeds 600 lines`)
  }
  return Object.freeze({
    sources: sources.map(entry => relative(repositoryRoot, entry.path)),
  })
}
