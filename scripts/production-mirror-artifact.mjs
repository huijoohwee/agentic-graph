import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const productionMirrorArtifactManifestName = '.knowgrph-production-artifact-manifest.json'
export const productionMirrorArtifactEntries = [
  '404.html',
  'content/knowgrph',
  'knowgrph',
  'functions',
  'canvas',
  'contracts',
  'grph-shared',
  '_worker.js',
  '_routes.json',
  '_headers',
  '_redirects',
  '.well-known/runtime-readiness.json',
]
const productionMirrorArtifactDeletionEntries = ['index.html']

const manifestSchema = 'knowgrph-production-mirror-artifact/v1'
const exactRevisionPattern = /^[0-9a-f]{40}$/
const isolatedGitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
)

const assertSafeRoot = (root, label) => {
  const resolved = path.resolve(root)
  if (resolved === path.parse(resolved).root) throw new Error(`${label} cannot be a filesystem root`)
  return resolved
}

const normalizeRelativePath = value => {
  const normalized = String(value || '').replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new Error(`Invalid artifact-relative path: ${JSON.stringify(value)}`)
  }
  const parts = normalized.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe artifact-relative path: ${JSON.stringify(value)}`)
  }
  return normalized
}

const resolveWithin = (root, relativePath) => {
  const normalized = normalizeRelativePath(relativePath)
  const resolved = path.resolve(root, ...normalized.split('/'))
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Artifact path escapes its root: ${relativePath}`)
  }
  return resolved
}

const isManagedPath = relativePath => [
  ...productionMirrorArtifactEntries,
  ...productionMirrorArtifactDeletionEntries,
].some(entry => relativePath === entry || relativePath.startsWith(`${entry}/`))

const readGitText = (root, args) => execFileSync('git', args, {
  cwd: root,
  encoding: 'utf8',
  env: isolatedGitEnvironment,
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()

const readDeletedPaths = root => {
  const output = execFileSync('git', ['diff', '--name-only', '--diff-filter=D', '-z', 'HEAD', '--'], {
    cwd: root,
    encoding: 'buffer',
    env: isolatedGitEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return output.toString('utf8').split('\0').filter(Boolean).map(normalizeRelativePath).sort()
}

const readManifest = async artifactRoot => {
  const manifestPath = resolveWithin(artifactRoot, productionMirrorArtifactManifestName)
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  if (manifest?.schema !== manifestSchema) throw new Error(`Unexpected production artifact schema: ${manifest?.schema}`)
  if (!exactRevisionPattern.test(manifest?.mirrorRevision || '')) {
    throw new Error('Production artifact manifest requires an exact mirror revision')
  }
  if (!Array.isArray(manifest?.deletedPaths)) throw new Error('Production artifact manifest requires deletedPaths')
  const deletedPaths = manifest.deletedPaths.map(normalizeRelativePath)
  if (new Set(deletedPaths).size !== deletedPaths.length) throw new Error('Production artifact manifest has duplicate deleted paths')
  for (const deletedPath of deletedPaths) {
    if (!isManagedPath(deletedPath)) throw new Error(`Production artifact cannot delete unmanaged path: ${deletedPath}`)
  }
  return { ...manifest, deletedPaths }
}

const digestFile = async filePath => createHash('sha256').update(await fs.readFile(filePath)).digest('hex')

const collectDirectoryFiles = async (directory, relativeRoot = '') => {
  const files = new Map()
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name
    const entryPath = path.resolve(directory, entry.name)
    if (entry.isDirectory()) {
      const nestedFiles = await collectDirectoryFiles(entryPath, relativePath)
      for (const [nestedPath, digest] of nestedFiles) files.set(nestedPath, digest)
      continue
    }
    if (!entry.isFile()) throw new Error(`Production artifact rejects non-file entry: ${relativePath}`)
    files.set(relativePath, await digestFile(entryPath))
  }
  return files
}

const assertEntryParity = async (artifactRoot, mirrorRoot, relativePath) => {
  const artifactPath = resolveWithin(artifactRoot, relativePath)
  const mirrorPath = resolveWithin(mirrorRoot, relativePath)
  const artifactStat = await fs.stat(artifactPath)
  const mirrorStat = await fs.stat(mirrorPath)
  if (artifactStat.isFile() && mirrorStat.isFile()) {
    if (await digestFile(artifactPath) !== await digestFile(mirrorPath)) {
      throw new Error(`Production artifact file parity failed: ${relativePath}`)
    }
    return
  }
  if (!artifactStat.isDirectory() || !mirrorStat.isDirectory()) {
    throw new Error(`Production artifact entry type mismatch: ${relativePath}`)
  }
  const artifactFiles = await collectDirectoryFiles(artifactPath)
  const mirrorFiles = await collectDirectoryFiles(mirrorPath)
  if (JSON.stringify([...artifactFiles]) !== JSON.stringify([...mirrorFiles])) {
    throw new Error(`Production artifact directory parity failed: ${relativePath}`)
  }
}

export const createProductionMirrorArtifactManifest = async ({ mirrorRoot }) => {
  const root = assertSafeRoot(mirrorRoot, 'Production mirror root')
  const mirrorRevision = readGitText(root, ['rev-parse', 'HEAD'])
  if (!exactRevisionPattern.test(mirrorRevision)) throw new Error('Production mirror base must be an exact revision')
  const deletedPaths = readDeletedPaths(root)
  for (const deletedPath of deletedPaths) {
    if (!isManagedPath(deletedPath)) throw new Error(`Production sync deleted unmanaged path: ${deletedPath}`)
  }
  const manifest = { schema: manifestSchema, mirrorRevision, deletedPaths }
  const manifestPath = resolveWithin(root, productionMirrorArtifactManifestName)
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { manifest, manifestPath }
}

export const reconcileProductionMirrorArtifact = async ({ artifactRoot, mirrorRoot }) => {
  const sourceRoot = assertSafeRoot(artifactRoot, 'Production artifact root')
  const targetRoot = assertSafeRoot(mirrorRoot, 'Production mirror root')
  if (sourceRoot === targetRoot) throw new Error('Production artifact and mirror roots must differ')
  const manifest = await readManifest(sourceRoot)
  const targetRevision = readGitText(targetRoot, ['rev-parse', 'HEAD'])
  if (targetRevision !== manifest.mirrorRevision) {
    throw new Error(`Production mirror base mismatch: expected ${manifest.mirrorRevision}, received ${targetRevision}`)
  }
  if (readGitText(targetRoot, ['status', '--porcelain=v1'])) {
    throw new Error('Production mirror checkout must be clean before artifact reconciliation')
  }

  const readinessPath = '.well-known/runtime-readiness.json'
  const contentReadinessPath = `content/knowgrph/${readinessPath}`
  const [rootReadiness, contentReadiness] = await Promise.all([
    fs.readFile(resolveWithin(sourceRoot, readinessPath)),
    fs.readFile(resolveWithin(sourceRoot, contentReadinessPath)),
  ])
  if (!rootReadiness.equals(contentReadiness)) throw new Error('Production artifact readiness markers must be byte-identical')

  for (const relativePath of productionMirrorArtifactEntries) await fs.stat(resolveWithin(sourceRoot, relativePath))
  for (const deletedPath of manifest.deletedPaths) {
    await fs.rm(resolveWithin(targetRoot, deletedPath), { force: true, recursive: true })
  }
  for (const relativePath of productionMirrorArtifactEntries) {
    const sourcePath = resolveWithin(sourceRoot, relativePath)
    const targetPath = resolveWithin(targetRoot, relativePath)
    const sourceStat = await fs.stat(sourcePath)
    await fs.rm(targetPath, { force: true, recursive: true })
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.cp(sourcePath, targetPath, { force: true, recursive: sourceStat.isDirectory() })
  }
  for (const relativePath of productionMirrorArtifactEntries) {
    await assertEntryParity(sourceRoot, targetRoot, relativePath)
  }
  return manifest
}

const run = async () => {
  const [command, firstRoot, secondRoot] = process.argv.slice(2)
  if (command === 'create' && firstRoot && !secondRoot) {
    const { manifestPath } = await createProductionMirrorArtifactManifest({ mirrorRoot: firstRoot })
    console.log(`[knowgrph] production mirror artifact manifest: ${manifestPath}`)
    return
  }
  if (command === 'reconcile' && firstRoot && secondRoot) {
    const manifest = await reconcileProductionMirrorArtifact({ artifactRoot: firstRoot, mirrorRoot: secondRoot })
    console.log(`[knowgrph] reconciled production mirror artifact from ${manifest.mirrorRevision}`)
    return
  }
  throw new Error('Usage: production-mirror-artifact.mjs create <mirror-root> | reconcile <artifact-root> <mirror-root>')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run()
}
