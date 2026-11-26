import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPOSITORY = 'huijoohwee/MiaoXYZ'
const SOURCE_PIN_PATH = 'scripts/miaoxyz-production-release-source.json'
const SOURCE_SCHEMA = 'miaoxyz-release-source/v1'
const shaPattern = /^[0-9a-f]{40}$/u

const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex')
const digestBytes = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))

export const readMiaoxyzSourcePin = repoRoot => {
  const pin = readJson(path.join(repoRoot, SOURCE_PIN_PATH))
  if (pin?.schema !== 'agentic-graph/miaoxyz-source-pin/v1' || pin.repository !== REPOSITORY ||
      !shaPattern.test(String(pin.revision || '')) || pin.manifestPath !== 'release/worker-source.json') {
    throw new Error('MiaoXYZ source pin is malformed')
  }
  return pin
}

const sourceRootFromCache = revision => {
  const root = path.join(os.tmpdir(), 'miaoxyz-release-source', revision)
  const repositoryUrl = 'https://github.com/huijoohwee/MiaoXYZ.git'
  if (!fs.existsSync(path.join(root, '.git'))) {
    fs.mkdirSync(path.dirname(root), { recursive: true })
    execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', repositoryUrl, root], { stdio: 'pipe' })
  }
  if (git(root, ['rev-parse', 'HEAD']) !== revision) {
    execFileSync('git', ['fetch', '--depth=1', 'origin', revision], { cwd: root, stdio: 'pipe' })
    execFileSync('git', ['checkout', '--detach', revision], { cwd: root, stdio: 'pipe' })
  }
  return root
}

export const resolveMiaoxyzProductRoot = (repoRoot, revision) => {
  const pin = readMiaoxyzSourcePin(repoRoot)
  const expectedRevision = revision ?? pin.revision
  if (expectedRevision !== pin.revision) throw new Error('MiaoXYZ candidate source differs from the exact source pin')
  const configuredRoot = process.env.MIAOXYZ_PRODUCT_SOURCE_ROOT
  return path.resolve(configuredRoot || sourceRootFromCache(expectedRevision))
}

const manifestIssues = manifest => {
  const issues = []
  if (!manifest || manifest.schema !== SOURCE_SCHEMA || manifest.repository !== REPOSITORY || manifest.canonicalBranch !== 'main') {
    issues.push('release source identity must be the canonical MiaoXYZ main repository')
  }
  if (manifest?.sourceRevisionBinding !== 'one exact MiaoXYZ commit produces every release output') {
    issues.push('release source must bind every output to one exact MiaoXYZ commit')
  }
  const inputs = manifest?.inputs
  const expectedArtifactPaths = ['package.json', 'package-lock.json', 'wrangler.jsonc', 'src/**', 'migrations/**', 'public/**']
  if (JSON.stringify(inputs?.artifactPaths) !== JSON.stringify(expectedArtifactPaths)) {
    issues.push('release source artifact paths differ from the reviewed MiaoXYZ contract')
  }
  if (JSON.stringify(inputs?.verificationOnlyPaths) !== JSON.stringify(['worker-configuration.d.ts']) ||
      JSON.stringify(inputs?.excludedPaths) !== JSON.stringify(['.dev.vars', '.wrangler/**', 'node_modules/**', 'catalog/**'])) {
    issues.push('release source local-state and verification exclusions differ from the reviewed contract')
  }
  const outputs = manifest?.outputs
  if (outputs?.pagesMirror?.sourceDirectory !== 'public/' ||
      outputs.pagesMirror.destinationDirectory !== 'content/MiaoXYZ/' || outputs.pagesMirror.mustBindSourceRevision !== true) {
    issues.push('Pages output must come from the pinned public directory')
  }
  const worker = outputs?.productionWorker
  if (worker?.config !== 'wrangler.jsonc' || worker.environment !== 'production' ||
      worker.entrypoint !== 'src/worker.ts' || worker.migrationDirectory !== 'migrations/' ||
      worker.mustBindSourceRevision !== true ||
      JSON.stringify(worker.routes) !== JSON.stringify(['airvio.co/MiaoXYZ/api', 'airvio.co/MiaoXYZ/api/*'])) {
    issues.push('Production Worker outputs and API-only routes differ from the reviewed contract')
  }
  const expectedBinding = ['repository', 'sourceRevision', 'sourceTreeDigest', 'manifestDigest',
    'pagesArtifactDigest', 'workerArtifactDigest', 'migrationDigest', 'routes']
  if (JSON.stringify(manifest?.candidateBinding) !== JSON.stringify(expectedBinding)) {
    issues.push('release candidate binding fields differ from the reviewed MiaoXYZ contract')
  }
  if (issues.length) throw new Error(`MiaoXYZ release source manifest is invalid:\n- ${issues.join('\n- ')}`)
}

const allowedArtifactPath = file => file === 'package.json' || file === 'package-lock.json' || file === 'wrangler.jsonc' ||
  file.startsWith('src/') || file.startsWith('migrations/') || file.startsWith('public/')
const recordsFor = (root, files, prefix = '') => files.map(relativePath => ({
  relativePath: `${prefix}${relativePath}`,
  digest: digestBytes(fs.readFileSync(path.join(root, relativePath))),
}))
const listDiskFiles = (root, directory) => {
  const files = []
  const visit = relativeDirectory => {
    const absoluteDirectory = path.join(root, relativeDirectory)
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const relativePath = path.posix.join(relativeDirectory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`MiaoXYZ release input must not contain symbolic links: ${relativePath}`)
      if (entry.isDirectory()) visit(relativePath)
      else if (entry.isFile()) files.push(relativePath)
      else throw new Error(`MiaoXYZ release input has an unsupported file type: ${relativePath}`)
    }
  }
  visit(directory)
  return files.sort((left, right) => left.localeCompare(right))
}

export const inspectMiaoxyzProductSource = ({ repoRoot, productRoot, revision } = {}) => {
  const pin = readMiaoxyzSourcePin(repoRoot)
  const expectedRevision = revision ?? pin.revision
  if (expectedRevision !== pin.revision) throw new Error('MiaoXYZ source revision differs from the Graph protected source pin')
  const root = fs.realpathSync(path.resolve(productRoot || resolveMiaoxyzProductRoot(repoRoot, expectedRevision)))
  const topLevel = fs.realpathSync(git(root, ['rev-parse', '--show-toplevel']))
  if (topLevel !== root || git(root, ['rev-parse', 'HEAD']) !== expectedRevision) {
    throw new Error('MiaoXYZ checkout does not match the exact pinned source revision')
  }
  if (git(root, ['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('MiaoXYZ product source checkout must be clean before release')
  }
  const tree = git(root, ['rev-parse', 'HEAD^{tree}'])
  if (!shaPattern.test(tree)) throw new Error('MiaoXYZ source tree identity is malformed')

  const manifest = readJson(path.join(root, pin.manifestPath))
  manifestIssues(manifest)
  const trackedFiles = git(root, ['ls-files', '-z']).split('\0').filter(Boolean).sort()
  const artifactFiles = trackedFiles.filter(allowedArtifactPath)
  if (!artifactFiles.includes('package.json') || !artifactFiles.includes('package-lock.json') ||
      !artifactFiles.includes('wrangler.jsonc') || !artifactFiles.some(file => file.startsWith('src/')) ||
      !artifactFiles.some(file => file.startsWith('migrations/')) || !artifactFiles.some(file => file.startsWith('public/'))) {
    throw new Error('MiaoXYZ release source is missing a required Worker, migration, package, or Pages input')
  }
  const diskArtifactFiles = [
    'package.json', 'package-lock.json', 'wrangler.jsonc',
    ...listDiskFiles(root, 'src'),
    ...listDiskFiles(root, 'migrations'),
    ...listDiskFiles(root, 'public'),
  ].sort((left, right) => left.localeCompare(right))
  if (JSON.stringify(diskArtifactFiles) !== JSON.stringify(artifactFiles)) {
    throw new Error('MiaoXYZ release inputs contain untracked, ignored, or missing artifact files')
  }
  const workerFiles = artifactFiles.filter(file => !file.startsWith('public/') && !file.startsWith('migrations/'))
  const pagesFiles = artifactFiles.filter(file => file.startsWith('public/'))
  const migrationFiles = artifactFiles.filter(file => file.startsWith('migrations/'))
  const workerRecords = recordsFor(root, workerFiles)
  const pagesRecords = pagesFiles.map(file => ({
    relativePath: `content/MiaoXYZ/${file.slice('public/'.length)}`,
    digest: digestBytes(fs.readFileSync(path.join(root, file))),
  }))
  const migrationRecords = recordsFor(root, migrationFiles)
  const pageRevisionMarker = `${JSON.stringify({
    schema: 'miaoxyz-generated-pages-source/v1',
    repository: REPOSITORY,
    revision: expectedRevision,
  }, null, 2)}\n`
  pagesRecords.push({
    relativePath: 'content/MiaoXYZ/.well-known/source-revision.json',
    digest: digestBytes(Buffer.from(pageRevisionMarker, 'utf8')),
  })
  pagesRecords.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  if (new Set(pagesRecords.map(record => record.relativePath)).size !== pagesRecords.length) {
    throw new Error('MiaoXYZ Pages source collides with the generated source revision marker')
  }
  const gitTreeRecords = git(root, ['ls-tree', '-r', '-z', 'HEAD']).split('\0').filter(Boolean).map(entry => {
    const separator = entry.indexOf('\t')
    if (separator < 0) throw new Error('MiaoXYZ source tree contains a malformed Git entry')
    const [mode, type, object] = entry.slice(0, separator).split(' ')
    return { mode, type, object, path: entry.slice(separator + 1) }
  })
  const releaseInputPaths = new Set(artifactFiles)
  if (gitTreeRecords.some(entry => releaseInputPaths.has(entry.path) && !['100644', '100755'].includes(entry.mode))) {
    throw new Error('MiaoXYZ release inputs must be tracked regular files')
  }
  return Object.freeze({
    repository: REPOSITORY,
    revision: expectedRevision,
    tree,
    treeDigest: digest(gitTreeRecords),
    manifestDigest: digest(manifest),
    manifest,
    root,
    workerFiles: workerRecords,
    pagesFiles: pagesRecords,
    migrationFiles: migrationRecords,
    workerArtifactDigest: digest(workerRecords),
    pagesArtifactDigest: digest(pagesRecords),
    migrationDigest: digest(migrationRecords),
  })
}
