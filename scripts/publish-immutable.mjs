import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import {
  assertFastForwardPublication,
  buildImmutableReleaseManifest,
  calculateImmutableReleaseManifestDigest,
  pushImmutableRevision,
  readRemoteRevision,
  serializeImmutableReleaseManifest,
} from './immutable-release-manifest.mjs'
import { repoRoot } from './collaboration-contract.mjs'

const main = async () => {
  const { values } = parseArgs({
    options: {
      'source-sha': { type: 'string' },
      'target-ref': { type: 'string' },
      'expected-remote-sha': { type: 'string' },
      remote: { type: 'string', default: 'origin' },
      output: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  })
  const sourceRevision = values['source-sha']
  const targetRef = values['target-ref']
  const expectedRemoteRevision = values['expected-remote-sha']
  if (!sourceRevision || !targetRef || !expectedRemoteRevision) {
    throw new Error('--source-sha, --target-ref, and --expected-remote-sha are required')
  }
  const remoteRevision = readRemoteRevision({ remote: values.remote, targetRef })
  if (remoteRevision !== expectedRemoteRevision) {
    throw new Error(`remote compare-and-set failed: expected ${expectedRemoteRevision}, received ${remoteRevision}`)
  }
  assertFastForwardPublication({ sourceRevision, remoteRevision })
  const manifest = await buildImmutableReleaseManifest({
    sourceRevision,
    targetRef,
    expectedRemoteRevision,
    publicationMode: 'checkout-free',
    pushHookMode: 'repository-owned-object-gate',
  })
  const manifestSource = serializeImmutableReleaseManifest(manifest)
  const digest = calculateImmutableReleaseManifestDigest(manifestSource)
  const gitDirectory = path.resolve(repoRoot, '.git')
  const outputPath = path.resolve(
    values.output || path.join(gitDirectory, 'agentic-graph-release-manifests', `${sourceRevision}.json`),
  )
  if (!outputPath.startsWith(`${gitDirectory}${path.sep}`)) {
    throw new Error('checkout-free manifest output must stay inside repository Git metadata')
  }
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, manifestSource, 'utf8')
  if (!values['dry-run']) {
    pushImmutableRevision({ remote: values.remote, sourceRevision, targetRef })
    const publishedRevision = readRemoteRevision({ remote: values.remote, targetRef })
    if (publishedRevision !== sourceRevision) {
      throw new Error(`remote verification failed: expected ${sourceRevision}, received ${publishedRevision}`)
    }
  }
  process.stdout.write(`${JSON.stringify({
    status: values['dry-run'] ? 'validated' : 'published',
    sourceRevision,
    targetRef,
    expectedRemoteRevision,
    manifestPath: outputPath,
    manifestDigest: digest,
    checkoutMutated: false,
    hookMode: 'repository-owned-object-gate',
  })}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
