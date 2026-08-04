import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const DOCUMENT_PATHS = Object.freeze([
  ['docs', 'documents', 'knowgrph-ar-vr-xr-prd-tad-adr.md'],
  ['docs', 'documents', 'knowgrph-xr-v2-runtime-readiness.md'],
  ['docs', 'TESTING.md'],
  ['docs', 'runtime-api.md'],
])
const REQUIRED_SHARED_MARKERS = Object.freeze([
  'node scripts/run-xr-v2-source-smoke.mjs',
  'node canvas/scripts/run_xr_v2_browser_smoke.mjs',
  'node scripts/run-video-editor-source-smoke.mjs',
  'npm run xr-v2:review-candidate',
  'npm run xr-v2:review-ready',
  'knowgrph-xr-v2-readiness/v1',
  'knowgrph-xr-v2-dev-runtime-evidence/v1',
  'knowgrph-xr-v2-browser-smoke/v1',
  'review-candidate',
  'xr-authoring-edited-media-delivery',
  'source-backed',
  'browser-native',
  'decoded',
  'physical-device',
  'model-asset',
  'blocked',
  'Dev-only',
])
const REQUIRED_ENTRY_MODES = Object.freeze([
  '`immersive-session`',
  '`inline-viewer`',
  '`monocular-capture`',
  '`native-handoff`',
  '`unsupported`',
])
const FORBIDDEN_DOCUMENT_MARKERS = Object.freeze([
  '`webxr-ar`',
  '`webxr-vr`',
  '`pseudo-ar-depth-parallax`',
  '`flat-fallback`',
  '/xr.capture',
  '/xr.author',
  'user-agent classification',
  'second renderer',
  'second camera',
  'second ECS',
  'second timeline',
  'custom muxer',
  'Theatre.js',
  '@theatre',
  'Rete.js',
  'three.quarks',
  'runtime-ready-dev',
])

export function verifyXrV2ReadinessDocumentation(repositoryRoot) {
  const documents = DOCUMENT_PATHS.map(parts => {
    const path = resolve(repositoryRoot, ...parts)
    if (!existsSync(path)) throw new Error(`expected XR v2 documentation at ${relative(repositoryRoot, path)}`)
    const source = readFileSync(path, 'utf8')
    const lineCount = source.split(/\r?\n/u).length
    if (lineCount > 600) throw new Error(`${relative(repositoryRoot, path)} exceeds 600 lines`)
    return { path, source }
  })
  const combined = documents.map(document => document.source).join('\n')

  for (const marker of REQUIRED_SHARED_MARKERS) {
    if (!combined.includes(marker)) throw new Error(`expected XR v2 readiness marker ${marker}`)
  }
  for (const mode of REQUIRED_ENTRY_MODES) {
    if (!combined.includes(mode)) throw new Error(`expected XR v2 readiness to retain ${mode}`)
  }
  for (const marker of FORBIDDEN_DOCUMENT_MARKERS) {
    if (combined.includes(marker)) throw new Error(`expected XR v2 readiness docs to avoid ${marker}`)
  }

  return Object.freeze({
    documents: documents.map(document => relative(repositoryRoot, document.path)),
    schema: 'knowgrph-xr-v2-runtime-readiness/v1',
  })
}
