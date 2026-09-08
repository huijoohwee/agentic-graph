import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveRepoSourcePath } from '@/tests/lib/repoTestData'
import {
  TEST_VALIDATION_WORKSPACE_SEED_BASENAME,
  TEST_VALIDATION_WORKSPACE_SEED_PATH,
} from '@/features/workspace-fs/workspaceFs'

const DEFAULT_DOCS_SSOT_CACHE_DIR = path.join(os.tmpdir(), 'agentic-graph-docs-ssot-fixtures')
const DEFAULT_DOCS_SSOT_WORKSPACE_ID = 'kgws:canonical-docs'
const DEFAULT_DOCS_SSOT_CANONICAL_PREFIX = 'agentic-canvas-os/docs'
const DOCS_SSOT_REQUEST_TIMEOUT_SECONDS = '20'
const MAX_DOCS_FIXTURE_BYTES = 499_999
const MAX_REMOTE_FIXTURE_PATHS = 64
const ownedRemoteFixturePaths = new Map<string, { directory: string; path: string }>()

export const clearDocsSsotFixtureCache = (): void => {
  for (const entry of ownedRemoteFixturePaths.values()) fs.rmSync(entry.directory, { recursive: true, force: true })
  ownedRemoteFixturePaths.clear()
}

process.once('exit', clearDocsSsotFixtureCache)

const readEnvString = (name: string, fallback = ''): string => {
  const value = String(process.env[name] || '').trim()
  return value || fallback
}

const normalizeDocsFixtureBasename = (basename: string): string => {
  const name = String(basename || '').trim()
  if (!name) throw new Error('expected docs fixture basename')
  if (name === '.' || name === '..' || name.includes('\0') || name !== path.basename(name) || name.includes('/') || name.includes('\\')) {
    throw new Error(`expected docs fixture basename, got ${name}`)
  }
  return name
}

export const DOCS_SSOT_VALIDATION_FIXTURE_BASENAME = normalizeDocsFixtureBasename(
  readEnvString('AG_TEST_DOCS_SSOT_VALIDATION_FIXTURE_BASENAME', TEST_VALIDATION_WORKSPACE_SEED_BASENAME),
)
export const DOCS_SSOT_VALIDATION_WORKSPACE_PATH = TEST_VALIDATION_WORKSPACE_SEED_PATH

const resolveDocsSsotCacheDir = (): string =>
  readEnvString('AG_TEST_DOCS_SSOT_CACHE_DIR', DEFAULT_DOCS_SSOT_CACHE_DIR)

const resolveDocsSsotStorageBaseUrl = (): string => readEnvString('AG_TEST_DOCS_SSOT_STORAGE_BASE_URL')

const resolveLocalDocsRoot = (): string => {
  const explicit = readEnvString('AG_TEST_DOCS_SSOT_ROOT') || readEnvString('AGENTIC_OS_PUBLISHED_DOCS_ROOT')
  return explicit ? path.resolve(explicit) : resolveRepoSourcePath('docs/workspace-seeds')
}

const decodeFixtureText = (bytes: Buffer, label: string): string => {
  if (bytes.length > MAX_DOCS_FIXTURE_BYTES) throw new Error(`docs fixture exceeds ${MAX_DOCS_FIXTURE_BYTES} bytes: ${label}`)
  const text = bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error(`docs fixture is not valid UTF-8: ${label}`)
  if (!text.trim()) throw new Error(`expected docs fixture to contain markdown text: ${label}`)
  return text
}

const readLocalFixture = (basename: string): { path: string; text: string } => {
  const localRoot = resolveLocalDocsRoot()
  const fixturePath = path.join(localRoot, basename)
  let fd: number
  let realRoot: string
  try {
    realRoot = fs.realpathSync(localRoot)
    if (fs.lstatSync(fixturePath).isSymbolicLink()) throw new Error('final fixture symlinks are not permitted')
    const relative = path.relative(realRoot, fs.realpathSync(fixturePath))
    if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
      throw new Error('fixture path escapes the selected local root')
    }
    fd = fs.openSync(fixturePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0))
  }
  catch (error) { throw new Error(`required local docs fixture is unavailable: ${fixturePath}`, { cause: error }) }
  try {
    const stat = fs.fstatSync(fd, { bigint: true })
    if (!stat.isFile()) throw new Error(`expected docs fixture to be a regular file: ${fixturePath}`)
    if (stat.size > MAX_DOCS_FIXTURE_BYTES) throw new Error(`docs fixture exceeds ${MAX_DOCS_FIXTURE_BYTES} bytes: ${fixturePath}`)
    const size = Number(stat.size)
    const bytes = Buffer.allocUnsafe(size + 1)
    let length = 0
    while (length < bytes.length) {
      const count = fs.readSync(fd, bytes, length, bytes.length - length, null)
      if (!count) break
      length += count
    }
    const after = fs.fstatSync(fd, { bigint: true })
    const finalPathStat = fs.lstatSync(fixturePath, { bigint: true })
    const unchanged = (other: fs.BigIntStats): boolean =>
      ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs'].every(key =>
        stat[key as keyof fs.BigIntStats] === other[key as keyof fs.BigIntStats])
    const relative = path.relative(realRoot, fs.realpathSync(fixturePath))
    if (length !== size || !unchanged(after) || !unchanged(finalPathStat)
      || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
      throw new Error(`docs fixture changed during read: ${fixturePath}`)
    }
    return { path: fixturePath, text: decodeFixtureText(bytes.subarray(0, length), fixturePath) }
  } finally { fs.closeSync(fd) }
}

const resolveDocsSsotWorkspaceId = (): string =>
  readEnvString('AG_TEST_DOCS_SSOT_WORKSPACE_ID', DEFAULT_DOCS_SSOT_WORKSPACE_ID)

const resolveDocsSsotCanonicalPrefix = (): string =>
  readEnvString('AG_TEST_DOCS_SSOT_CANONICAL_PREFIX', DEFAULT_DOCS_SSOT_CANONICAL_PREFIX).replace(/^\/+|\/+$/g, '')

const buildDocsSsotCanonicalPath = (basename: string): string => {
  const prefix = resolveDocsSsotCanonicalPrefix()
  return prefix ? `${prefix}/${basename}` : basename
}

const buildDocsSsotDocViewUrl = (basename: string): string => {
  const baseUrl = resolveDocsSsotStorageBaseUrl().replace(/\/+$/g, '')
  const workspaceId = resolveDocsSsotWorkspaceId()
  const canonicalPath = buildDocsSsotCanonicalPath(basename)
  if (!baseUrl || !workspaceId || !canonicalPath) {
    throw new Error('expected docs SSOT storage base URL, workspace ID, and canonical path')
  }
  const parsed = new URL(baseUrl)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('expected an explicit HTTP(S) docs fixture storage origin without credentials, query, or fragment')
  }
  return `${baseUrl}/api/storage/doc/${encodeURIComponent(workspaceId)}/${encodeURIComponent(canonicalPath)}`
}

const fetchDocsSsotFixtureText = (url: string): string => {
  try {
    const bytes = execFileSync(
      'curl',
      ['-sS', '--fail', '--max-time', DOCS_SSOT_REQUEST_TIMEOUT_SECONDS, '--max-filesize', String(MAX_DOCS_FIXTURE_BYTES), url],
      { maxBuffer: MAX_DOCS_FIXTURE_BYTES, timeout: 21_000, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return decodeFixtureText(bytes, url)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`failed to fetch explicitly configured docs fixture ${url}: ${message}`)
  }
}

const ensureDocsSsotFixtureCache = (basename: string): string => {
  const url = buildDocsSsotDocViewUrl(basename)
  const cacheRoot = path.resolve(resolveDocsSsotCacheDir())
  const key = JSON.stringify([cacheRoot, url])
  const existing = ownedRemoteFixturePaths.get(key)
  if (!existing && ownedRemoteFixturePaths.size >= MAX_REMOTE_FIXTURE_PATHS) {
    throw new Error(`explicit remote docs fixture path limit reached: ${MAX_REMOTE_FIXTURE_PATHS}`)
  }
  // A path is needed by callers, but a mutable remote response is never treated as
  // immutable evidence: every explicit remote read refreshes the bounded bytes.
  const text = fetchDocsSsotFixtureText(url)
  fs.mkdirSync(cacheRoot, { recursive: true })
  const directory = existing?.directory || fs.mkdtempSync(path.join(cacheRoot, 'fixture-run-'))
  const cachePath = existing?.path || path.join(directory, basename)
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(tempPath, text, 'utf8')
    fs.renameSync(tempPath, cachePath)
    ownedRemoteFixturePaths.set(key, { directory, path: cachePath })
  } finally {
    fs.rmSync(tempPath, { force: true })
    if (!ownedRemoteFixturePaths.has(key)) fs.rmSync(directory, { recursive: true, force: true })
  }
  return cachePath
}

export function resolveDocsSsotValidationFixturePath(): string {
  return resolveDocsSsotFixturePath(DOCS_SSOT_VALIDATION_FIXTURE_BASENAME)
}

export function resolveDocsSsotRootPath(): string {
  return resolveDocsSsotStorageBaseUrl() ? resolveDocsSsotCacheDir() : resolveLocalDocsRoot()
}

export function resolveDocsSsotFixturePath(basename: string): string {
  const name = normalizeDocsFixtureBasename(basename)
  return resolveDocsSsotStorageBaseUrl() ? ensureDocsSsotFixtureCache(name) : readLocalFixture(name).path
}

export function readDocsSsotFixtureText(basename: string): string {
  const name = normalizeDocsFixtureBasename(basename)
  if (!resolveDocsSsotStorageBaseUrl()) return readLocalFixture(name).text
  return fetchDocsSsotFixtureText(buildDocsSsotDocViewUrl(name))
}
