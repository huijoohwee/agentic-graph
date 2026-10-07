/** Local browser-test build evidence; never deployment or release authority. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { constants, existsSync, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readRuntimeDocsSources } from './runtime-docs-sources.mjs'
import { resolveAgenticCanvasOsDocsRoot, resolveAgenticCanvasOsDocsRevision } from '../mcp/agentic-canvas-os-docs-runtime.js'
import { AGENT_HISTORY_MANIFEST } from '../mcp/agentic-os-doc-sources.mjs'
import { executionEnvironment, readGit, validationGitConfiguration } from '../node_modules/agentic-os/bin/agentic-os-test-inputs.mjs'

const SCHEMA = 'agentic-graph/browser-proof-build/v1', COMMAND = ['npm', 'run', 'pages:build']
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), RECEIPT = '.tmp/browser-proof-build/receipt.json'
const LIMITS = { files: 120000, bytes: 4 * 1024 ** 3, fileBytes: 512 * 1024 ** 2, receiptBytes: 16384 }
export const BUILD_PHASE_LIMITS = Object.freeze({ input: 60000, compile: 300000, output: 60000 })
const HASH_BUFFER = Buffer.allocUnsafe(1024 * 1024)
const digest = value => createHash('sha256').update(value).digest('hex')
const stamp = stat => [stat.dev, stat.ino, stat.size, stat.mode, stat.mtimeNs, stat.ctimeNs].join(':')
const safe = path => {
  if (!path || path.startsWith('/') || path.includes('\\') || /[\x00-\x1f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..' || part === '.git')) throw Error('Unsafe build proof path')
  return path
}
function hashContext({ now = () => performance.now(), observe = value => console.log('[browser-proof-build] ' + JSON.stringify(value)) } = {}) {
  const cache = new Map(), counts = { hashedFiles: 0, readBytes: 0, cacheHits: 0 }
  let deadline = Infinity, phase = 'verification'
  const check = () => { if (now() > deadline) throw Error('Build proof phase timeout: ' + phase) }
  return { cache, counts, check, async phase(name, budgetMs, operation) {
    phase = name; const started = now(), before = { ...counts }; deadline = started + budgetMs
    const report = status => observe({ phase, status, budgetMs, elapsedMs: Math.max(0, now() - started),
      ...Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value - before[key]])) })
    try { report('started'); check(); const result = await operation(); check(); report('completed'); return result }
    catch (error) { report('failed'); throw error }
    finally { deadline = Infinity }
  } }
}
function hashFile(path, context) {
  context.check()
  if (realpathSync.native(path) !== path) throw Error('Build proof rejects symlink paths')
  const before = lstatSync(path, { bigint: true }), identity = stamp(before)
  if (!before.isFile() || before.size > BigInt(LIMITS.fileBytes)) throw Error('Build proof file budget/type exceeded')
  const cached = context.cache.get(path)
  if (cached?.identity === identity) {
    if (stamp(lstatSync(path, { bigint: true })) !== identity) throw Error('Build proof file changed while observing')
    context.counts.cacheHits++; return cached.value
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (stamp(fstatSync(fd, { bigint: true })) !== identity) throw Error('Build proof file changed before hashing')
    const hash = createHash('sha256'); let bytes = 0, size
    while ((size = readSync(fd, HASH_BUFFER, 0, HASH_BUFFER.length, null))) {
      context.check(); bytes += size; hash.update(HASH_BUFFER.subarray(0, size))
    }
    if (bytes !== Number(before.size) || stamp(fstatSync(fd, { bigint: true })) !== identity
      || stamp(lstatSync(path, { bigint: true })) !== identity) throw Error('Build proof file changed while hashing')
    const value = { bytes, mode: Number(before.mode & 0o111n), sha256: hash.digest('hex') }
    if (!context.cache.has(path) && context.cache.size >= LIMITS.files) throw Error('Build proof hash cache budget exceeded')
    context.cache.set(path, { identity, value }); context.counts.hashedFiles++; context.counts.readBytes += bytes
    return value
  } finally { closeSync(fd) }
}
function inventory(root, paths, context, { directories = false, dependencyLinks = false, workspaces = [] } = {}) {
  const hash = createHash('sha256'); let files = 0, bytes = 0
  const add = (path, value) => {
    if (++files > LIMITS.files || (bytes += value.bytes || 0) > LIMITS.bytes) throw Error('Build proof inventory budget exceeded')
    hash.update(JSON.stringify([path, value]) + '\n')
  }
  const visit = path => {
    context.check(); safe(path); const absolute = join(root, path), stat = lstatSync(absolute)
    if (stat.isSymbolicLink()) {
      if (!dependencyLinks) throw Error('Build proof rejects output/source symlinks')
      const target = realpathSync.native(absolute), rel = relative(root, target)
      safe(rel)
      if (join(root, rel) !== target || (!rel.includes('node_modules/') && !workspaces.some(workspace => rel === workspace || rel.startsWith(workspace + '/')))) throw Error('Build dependency symlink escapes admitted inputs')
      add(path, { link: readlinkSync(absolute), target: rel }); return
    }
    if (stat.isDirectory() && directories) {
      if (realpathSync.native(absolute) !== absolute) throw Error('Build proof path escapes repository')
      // Exclude generated compiler caches.
      if (dependencyLinks && /(?:^|\/)node_modules\/(?:\.vite|\.vite-temp|\.cache)$/.test(path)) return
      add(path, { directory: true })
      for (const child of readdirSync(absolute).sort()) visit(path + '/' + child)
    } else add(path, hashFile(absolute, context))
  }
  for (const path of [...new Set(paths)].sort()) visit(path)
  return { digest: hash.digest('hex'), files, bytes }
}
async function docsInput(root, environment, context) {
  const docsRoot = resolveAgenticCanvasOsDocsRoot({ rootDir: root, env: environment })
  const revision = await resolveAgenticCanvasOsDocsRevision({ absoluteDocsRoot: docsRoot, env: environment })
  const records = await readRuntimeDocsSources({ docsRoot, graphRoot: root })
  return { docsRoot, revision, manifest: hashFile(resolve(docsRoot, '../..', AGENT_HISTORY_MANIFEST), context),
    digest: digest(JSON.stringify(records.map(record => [record.filePath, record.sourcePath, digest(record.bytes)]))) }
}
async function sourceInputs(root, environment, readDocs, context) {
  if (realpathSync.native(root) !== root || resolve(readGit(root, ['rev-parse', '--show-toplevel']).trim()) !== root) throw Error('Build proof requires a canonical repository root')
  if (readGit(root, ['status', '--porcelain=v1', '--untracked-files=all']).trim()) throw Error('Build proof requires clean source')
  const revision = readGit(root, ['rev-parse', 'HEAD']).trim(), tree = readGit(root, ['rev-parse', 'HEAD^{tree}']).trim()
  if (environment.AGENTIC_OS_SOURCE_REVISION && environment.AGENTIC_OS_SOURCE_REVISION !== revision) throw Error('Build runtime revision differs from HEAD')
  const tracked = readGit(root, ['ls-files', '-z']).split('\0').filter(Boolean)
  const extras = ['.npmrc', 'canvas/.npmrc', 'package-lock.json', ...['', 'canvas/'].flatMap(prefix => ['.env', '.env.local', '.env.production', '.env.production.local'].map(name => prefix + name))].filter(path => existsSync(join(root, path)))
  hashFile(join(root, 'package.json'), context)
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const workspaces = (packageJson.workspaces || []).map(safe)
  const dependencies = ['node_modules', ...workspaces.map(path => path + '/node_modules')].filter(path => existsSync(join(root, path)))
  const env = executionEnvironment(environment); delete env.AGENTIC_OS_COMMAND_ANCESTRY
  const identity = { docs: await readDocs(root, environment, context), revision, tree, branch: readGit(root, ['branch', '--show-current']).trim(),
    source: inventory(root, [...tracked, ...extras], context), configurationDigest: digest(validationGitConfiguration(root)),
    dependency: inventory(root, dependencies, context, { directories: true, dependencyLinks: true, workspaces }),
    environmentDigest: digest(JSON.stringify(env)), executable: hashFile(realpathSync.native(process.execPath), context), node: process.version, platform: process.platform, arch: process.arch,
    producerSha256: hashFile(fileURLToPath(import.meta.url), context).sha256 }
  if (readGit(root, ['rev-parse', 'HEAD']).trim() !== revision || readGit(root, ['status', '--porcelain=v1', '--untracked-files=all']).trim()) throw Error('Build source changed during snapshot')
  return { identity, workspaces }
}
function generatedDependencies(root, workspaces, context) {
  return inventory(root, ['canvas/public', ...workspaces.filter(path => path !== 'canvas').map(path => path + '/dist')].filter(path => existsSync(join(root, path))), context, { directories: true })
}
function receiptPath(root, create = false) {
  const path = join(root, RECEIPT)
  for (const directory of [join(root, '.tmp'), dirname(path)]) {
    if (!existsSync(directory) && create) mkdirSync(directory, { mode: 0o700 })
    if (existsSync(directory) && (!lstatSync(directory).isDirectory() || realpathSync.native(directory) !== directory)) throw Error('Build receipt directory is unsafe')
  }
  if (existsSync(path) && (!lstatSync(path).isFile() || realpathSync.native(path) !== path)) throw Error('Build receipt is unsafe')
  readGit(root, ['check-ignore', '--no-index', RECEIPT])
  return path
}
function artifacts(root, revision, context) {
  for (const path of ['index.html', 'sw.js', 'agentic-graph-service-worker-revision.js', `learning-offline-manifest-${revision}.json`]) {
    if (!existsSync(join(root, 'canvas/dist', path))) throw Error('Build output incomplete: ' + path)
  }
  const manifestPath = join(root, 'canvas/dist', `learning-offline-manifest-${revision}.json`)
  if (!lstatSync(manifestPath).isFile() || realpathSync.native(manifestPath) !== manifestPath) throw Error('Build manifest rejects symlinks')
  if (lstatSync(manifestPath).size > 1024 * 1024) throw Error('Build manifest exceeds budget')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.revision !== revision || manifest.schema !== 'python-learning-offline/v1' || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 4096) throw Error('Build output manifest is invalid')
  const names = new Set()
  for (const file of manifest.files) {
    safe(file.path)
    if (names.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw Error('Build manifest entry is invalid')
    names.add(file.path); const actual = hashFile(join(root, 'canvas/dist', file.path), context)
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) throw Error('Build manifest bytes differ')
  }
  if (!names.has('index.html') || ![...names].some(path => /pythonWorker/.test(path))) throw Error('Build manifest closure is incomplete')
  return inventory(root, ['canvas/dist'], context, { directories: true })
}
export async function produceBrowserProofBuild({ root = ROOT, environment = process.env, readDocs = docsInput,
  now, observe, runBuild = () => execFileSync(COMMAND[0], COMMAND.slice(1), { cwd: root, env: environment, stdio: 'inherit', timeout: BUILD_PHASE_LIMITS.compile }) } = {}) {
  root = resolve(root); const context = hashContext({ now, observe }); let path
  try {
    const before = await context.phase('pre-build-inputs', BUILD_PHASE_LIMITS.input, async () => {
      path = receiptPath(root, true); if (existsSync(path)) unlinkSync(path)
      return sourceInputs(root, environment, readDocs, context)
    })
    await context.phase('compiler', BUILD_PHASE_LIMITS.compile, runBuild)
    return await context.phase('post-build-verification', BUILD_PHASE_LIMITS.output, async () => {
      const after = await sourceInputs(root, environment, readDocs, context)
      if (JSON.stringify(before.identity) !== JSON.stringify(after.identity)) throw Error('Build inputs changed during execution')
      const receipt = { schema: SCHEMA, authority: false, status: 'built', command: COMMAND, identity: after.identity,
        generatedDependencies: generatedDependencies(root, after.workspaces, context), artifacts: artifacts(root, after.identity.revision, context) }
      const text = JSON.stringify(receipt) + '\n'
      if (Buffer.byteLength(text) > LIMITS.receiptBytes) throw Error('Build receipt exceeds budget')
      context.check(); const temporary = path + '.pending'
      writeFileSync(temporary, text, { mode: 0o600, flag: 'wx' })
      try { renameSync(temporary, path) } finally { if (existsSync(temporary)) unlinkSync(temporary) }
      return receipt
    })
  } catch (error) { if (path && existsSync(path)) unlinkSync(path); throw error }
}
export async function verifyBrowserProofBuild(root = ROOT, { environment = process.env, readDocs = docsInput } = {}) {
  root = resolve(root); const path = receiptPath(root)
  if (!existsSync(path) || lstatSync(path).size > LIMITS.receiptBytes) throw Error('Missing or oversized verified browser build receipt')
  const receipt = JSON.parse(readFileSync(path, 'utf8'))
  if (receipt.schema !== SCHEMA || receipt.authority !== false || receipt.status !== 'built' || JSON.stringify(receipt.command) !== JSON.stringify(COMMAND)) throw Error('Invalid verified browser build receipt')
  const context = hashContext(), current = await sourceInputs(root, environment, readDocs, context)
  if (JSON.stringify(current.identity) !== JSON.stringify(receipt.identity)) throw Error('Verified browser build inputs differ')
  if (JSON.stringify(generatedDependencies(root, current.workspaces, context)) !== JSON.stringify(receipt.generatedDependencies)) throw Error('Verified browser build generated dependencies differ')
  if (JSON.stringify(artifacts(root, current.identity.revision, context)) !== JSON.stringify(receipt.artifacts)) throw Error('Verified browser build artifacts differ')
  return { revision: current.identity.revision, tree: current.identity.tree, artifactDigest: receipt.artifacts.digest }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 2) throw Error('Browser proof build accepts no arguments')
  const receipt = await produceBrowserProofBuild()
  console.log(JSON.stringify({ status: 'built', revision: receipt.identity.revision, artifactDigest: receipt.artifacts.digest, authority: false }))
}
