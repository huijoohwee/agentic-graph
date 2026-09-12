import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAgentReadyStaticFiles } from '../cloudflare/pages/agentic-graph-agent-ready.mjs'
import { CANONICAL_IMAGE_ROOT } from './mirror-namespace-contract.mjs'
import { assertSafeRoot, resolveWithin } from './production-mirror-artifact-paths.mjs'

export const productionMirrorArtifactManifestName = '.agentic-graph-production-artifact-manifest.json'
// The generator owns discovery paths. Transfer the same files it produces,
// including root aliases, without adopting unrelated files in .well-known.
export const productionMirrorArtifactEntries = Object.freeze([
  '404.html', 'README.md', 'content/agentic-graph', 'agentic-graph', '81rv10/index.html', CANONICAL_IMAGE_ROOT, 'functions', 'canvas',
  'contracts', 'grph-shared', '_worker.js', '_routes.json', '_headers', '_redirects',
  '.well-known/runtime-readiness.json', ...Object.keys(await buildAgentReadyStaticFiles()),
])

export const stageProductionMirrorArtifact = async ({ mirrorRoot, artifactRoot }) => {
  const source = assertSafeRoot(mirrorRoot, 'Production mirror root')
  const target = assertSafeRoot(artifactRoot, 'Production artifact staging root')
  if (source === target || target.startsWith(`${source}${path.sep}`)) throw new Error('Artifact staging must be outside the mirror')
  const entries = [...productionMirrorArtifactEntries, productionMirrorArtifactManifestName]
  for (const entry of entries) {
    const stat = await fs.lstat(resolveWithin(source, entry))
    if (!stat.isFile() && !stat.isDirectory()) throw new Error(`Unsupported artifact entry: ${entry}`)
  }
  await fs.mkdir(target) // Refuse an existing destination rather than retain stale bytes.
  for (const entry of entries) {
    const destination = resolveWithin(target, entry)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.cp(resolveWithin(source, entry), destination, { recursive: true, errorOnExist: true, force: false })
  }
  return { entries: entries.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, mirrorRoot, artifactRoot, ...extra] = process.argv.slice(2)
  if (command !== 'stage' || !mirrorRoot || !artifactRoot || extra.length) throw new Error('Usage: production-mirror-artifact-entries.mjs stage <mirror-root> <new-artifact-root>')
  console.log(JSON.stringify(await stageProductionMirrorArtifact({ mirrorRoot, artifactRoot })))
}
