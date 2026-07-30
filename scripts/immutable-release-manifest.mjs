import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { parseFrontmatter, repoRoot } from './collaboration-contract.mjs'
import { resolveRuntimeDocsDependency } from './runtime-readiness-contract.mjs'

export const IMMUTABLE_RELEASE_MANIFEST_SCHEMA = 'knowgrph.immutable-release-manifest/v1'
export const IMMUTABLE_RELEASE_MANIFEST_SCHEMA_PATH = path.resolve(
  repoRoot,
  'schemas',
  'immutable-release-manifest.v1.schema.json',
)

const SHA_PATTERN = /^[0-9a-f]{40}$/
const ZERO_SHA = '0'.repeat(40)
let validatorPromise = null

const runGit = (args, cwd = repoRoot) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} exited with status ${result.status}`)
  }
  return result.stdout.trim()
}

const requireSha = (value, label, { allowZero = false } = {}) => {
  const revision = String(value || '').trim()
  if (!SHA_PATTERN.test(revision) || (!allowZero && revision === ZERO_SHA)) {
    throw new Error(`${label} must be an exact lowercase 40-character Git commit SHA`)
  }
  return revision
}

export const resolveGitHubRepository = value => {
  const remote = String(value || '').trim()
  const slugMatch = remote.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/)
  if (slugMatch) return slugMatch[1]
  const match = remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/)
  if (!match) throw new Error('origin must identify one GitHub repository')
  return match[1]
}

const readObjectText = (sourceRevision, objectPath, cwd) => (
  runGit(['show', `${sourceRevision}:${objectPath}`], cwd)
)

const loadValidator = async () => {
  if (!validatorPromise) {
    validatorPromise = readFile(IMMUTABLE_RELEASE_MANIFEST_SCHEMA_PATH, 'utf8').then(source => {
      const schema = JSON.parse(source)
      const ajv = new Ajv2020({ allErrors: true, strict: true })
      return { ajv, schema, validate: ajv.compile(schema) }
    })
  }
  return validatorPromise
}

export const calculateImmutableReleaseManifestDigest = source => (
  createHash('sha256').update(source).digest('hex')
)

export const serializeImmutableReleaseManifest = manifest => `${JSON.stringify(manifest, null, 2)}\n`

export const validateImmutableReleaseManifest = async manifest => {
  const { ajv, validate } = await loadValidator()
  if (!validate(manifest)) {
    const detail = ajv.errorsText(validate.errors, { dataVar: 'manifest', separator: '; ' })
    throw new Error(`invalid ${IMMUTABLE_RELEASE_MANIFEST_SCHEMA}: ${detail}`)
  }
  if (manifest.catalogRevision !== manifest.agenticCanvasOs.revision) {
    throw new Error('immutable release manifest catalog revision must equal the Agentic Canvas OS revision')
  }
  return manifest
}

export const validateImmutableReleaseManifestSource = async (source, expected = {}) => {
  const manifest = await validateImmutableReleaseManifest(JSON.parse(String(source)))
  const digest = calculateImmutableReleaseManifestDigest(source)
  if (expected.sourceRevision && manifest.sourceRevision !== expected.sourceRevision) {
    throw new Error(`immutable release source revision mismatch: expected ${expected.sourceRevision}, received ${manifest.sourceRevision}`)
  }
  if (expected.agenticCanvasOsRevision && manifest.agenticCanvasOs.revision !== expected.agenticCanvasOsRevision) {
    throw new Error(`immutable release docs revision mismatch: expected ${expected.agenticCanvasOsRevision}, received ${manifest.agenticCanvasOs.revision}`)
  }
  if (expected.digest && digest !== expected.digest) {
    throw new Error(`immutable release manifest digest mismatch: expected ${expected.digest}, received ${digest}`)
  }
  return { manifest, digest }
}

export const inspectImmutableReleaseSource = async ({
  sourceRevision,
  targetRef,
  allowProtectedRef = false,
  cwd = repoRoot,
}) => {
  const revision = requireSha(sourceRevision, 'source revision')
  runGit(['cat-file', '-e', `${revision}^{commit}`], cwd)
  const sourceTree = requireSha(runGit(['rev-parse', `${revision}^{tree}`], cwd), 'source tree')
  const runtimeContract = parseFrontmatter(
    readObjectText(revision, 'docs/runtime-readiness-contract.md', cwd),
    'docs/runtime-readiness-contract.md',
  )
  const collaborationContract = parseFrontmatter(
    readObjectText(revision, 'docs/collaboration-runtime-contract.md', cwd),
    'docs/collaboration-runtime-contract.md',
  )
  const dependency = resolveRuntimeDocsDependency(runtimeContract)
  const branch = String(targetRef || '').replace(/^refs\/heads\//, '')
  const branchPattern = new RegExp(collaborationContract.coordination.branch_pattern)
  const protectedRefAllowed = allowProtectedRef
    && collaborationContract.coordination.protected_push_refs.includes(targetRef)
  if (targetRef !== `refs/heads/${branch}` || (!branchPattern.test(branch) && !protectedRefAllowed)) {
    throw new Error('target ref must be one contract-valid unprotected task branch')
  }
  const repository = resolveGitHubRepository(
    process.env.KNOWGRPH_REPOSITORY || runGit(['remote', 'get-url', 'origin'], cwd),
  )
  return { revision, sourceTree, dependency, repository }
}

export const buildImmutableReleaseManifest = async ({
  sourceRevision,
  targetRef,
  expectedRemoteRevision = null,
  publicationMode = 'ci',
  pushHookMode = 'not-applicable',
  cwd = repoRoot,
}) => {
  const source = await inspectImmutableReleaseSource({
    sourceRevision,
    targetRef,
    allowProtectedRef: publicationMode === 'ci',
    cwd,
  })
  const expectedRemote = expectedRemoteRevision === null
    ? null
    : requireSha(expectedRemoteRevision, 'expected remote revision', { allowZero: true })
  return validateImmutableReleaseManifest({
    schema: IMMUTABLE_RELEASE_MANIFEST_SCHEMA,
    repository: source.repository,
    sourceRevision: source.revision,
    sourceTree: source.sourceTree,
    targetRef,
    agenticCanvasOs: {
      repository: source.dependency.repository,
      revision: source.dependency.ref,
    },
    catalogRevision: source.dependency.ref,
    expectedRemoteRevision: expectedRemote,
    publicationMode,
    pushHookMode,
  })
}

export const assertFastForwardPublication = ({ sourceRevision, remoteRevision, cwd = repoRoot }) => {
  const source = requireSha(sourceRevision, 'source revision')
  const remote = requireSha(remoteRevision, 'remote revision', { allowZero: true })
  if (remote === ZERO_SHA) return
  runGit(['merge-base', '--is-ancestor', remote, source], cwd)
}

export const readRemoteRevision = ({ remote, targetRef, cwd = repoRoot }) => {
  const output = runGit(['ls-remote', '--refs', remote, targetRef], cwd)
  if (!output) return ZERO_SHA
  const [revision, resolvedRef] = output.split(/\s+/)
  if (resolvedRef !== targetRef) throw new Error(`remote returned unexpected ref ${resolvedRef}`)
  return requireSha(revision, 'remote revision')
}

export const assertRemoteRevisionAuthority = ({
  sourceRevision,
  remoteRevision,
  targetRef,
}) => {
  const source = requireSha(sourceRevision, 'release source revision')
  const current = requireSha(remoteRevision, 'remote revision')
  if (source !== current) {
    throw new Error(`release source revision ${source} is stale; remote ${targetRef} is ${current}`)
  }
  return { sourceRevision: source, remoteRevision: current, targetRef }
}

export const pushImmutableRevision = ({ remote, sourceRevision, targetRef, cwd = repoRoot }) => {
  runGit(['push', '--no-verify', remote, `${sourceRevision}:${targetRef}`], cwd)
}

export { ZERO_SHA }
