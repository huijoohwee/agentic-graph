import fs from 'node:fs/promises'
import path from 'node:path'
import {
  buildImmutableReleaseManifest,
  calculateImmutableReleaseManifestDigest,
  serializeImmutableReleaseManifest,
} from './immutable-release-manifest.mjs'
import {
  calculateRuntimeArtifactDigest,
  serializeProductionRuntimeReadiness,
  validateProductionRuntimeReadiness,
} from './production-runtime-readiness.mjs'

export const productionRuntimeReadinessHeaderLines = [
  '/.well-known/runtime-readiness.json',
  '  Content-Type: application/json; charset=utf-8',
  '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
  '/content/agenticgraph/.well-known/runtime-readiness.json',
  '  Content-Type: application/json; charset=utf-8',
  '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
  '/agenticgraph/.well-known/runtime-readiness.json',
  '  Content-Type: application/json; charset=utf-8',
  '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
]

export const buildProductionRuntimeReadiness = async ({
  sourceRevision,
  agenticgraphRoot,
  mirrorRoot,
  contentRoot,
  artifactEntries,
}) => {
  const relativePath = path.posix.join('.well-known', 'runtime-readiness.json')
  const paths = [mirrorRoot, contentRoot].map(root => path.resolve(root, relativePath))
  const artifactDigest = await calculateRuntimeArtifactDigest(artifactEntries)
  const immutableManifest = await buildImmutableReleaseManifest({
    sourceRevision,
    targetRef: 'refs/heads/main',
    publicationMode: 'ci',
    cwd: agenticgraphRoot,
  })
  const immutableManifestDigest = calculateImmutableReleaseManifestDigest(
    serializeImmutableReleaseManifest(immutableManifest),
  )
  const readiness = await validateProductionRuntimeReadiness({
    schema: 'agenticgraph-production-runtime-readiness/v2',
    status: 'verified-build',
    source: {
      repository: immutableManifest.repository,
      revision: immutableManifest.sourceRevision,
      tree: immutableManifest.sourceTree,
    },
    agenticCanvasOs: immutableManifest.agenticCanvasOs,
    catalogRevision: immutableManifest.catalogRevision,
    artifact: { algorithm: 'sha256', digest: artifactDigest },
    immutableManifest: { algorithm: 'sha256', digest: immutableManifestDigest },
    mirror: { repository: 'huijoohwee/huijoohwee' },
    surfaces: ['/', '/agenticgraph'],
  }, { sourceRevision, artifactDigest, immutableManifestDigest })
  return { relativePath, paths, body: serializeProductionRuntimeReadiness(readiness) }
}

export const findRuntimeReadinessPathsNeedingUpdate = async ({ paths, body }) => {
  const results = await Promise.all(paths.map(async filePath => {
    try {
      return await fs.readFile(filePath, 'utf8') === body ? null : filePath
    } catch {
      return filePath
    }
  }))
  return results.filter(Boolean)
}
