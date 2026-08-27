import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  TEST_VALIDATION_WORKSPACE_SEED_BASENAME,
  TEST_VALIDATION_WORKSPACE_SEED_PATH,
} from '@/features/workspace-fs/workspaceFs'

const DEFAULT_DOCS_SSOT_CACHE_DIR = path.join(os.tmpdir(), 'agenticgraph-docs-ssot-fixtures')
const DEFAULT_DOCS_SSOT_STORAGE_BASE_URL = 'https://airvio.co'
const DEFAULT_DOCS_SSOT_WORKSPACE_ID = 'kgws:canonical-docs'
const DEFAULT_DOCS_SSOT_CANONICAL_PREFIX = 'agentic-canvas-os/docs'
const DOCS_SSOT_REQUEST_TIMEOUT_SECONDS = '20'

const fetchedFixtureTextByBasename = new Map<string, string>()
const fetchedFixturePathByBasename = new Map<string, string>()

const readEnvString = (name: string, fallback = ''): string => {
  const value = String(process.env[name] || '').trim()
  return value || fallback
}

const normalizeDocsFixtureBasename = (basename: string): string => {
  const name = String(basename || '').trim()
  if (!name) throw new Error('expected docs fixture basename')
  if (name !== path.basename(name) || name.includes('/') || name.includes('\\')) {
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

const resolveDocsSsotStorageBaseUrl = (): string =>
  readEnvString('AG_TEST_DOCS_SSOT_STORAGE_BASE_URL', DEFAULT_DOCS_SSOT_STORAGE_BASE_URL)

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
  return `${baseUrl}/api/storage/doc/${encodeURIComponent(workspaceId)}/${encodeURIComponent(canonicalPath)}`
}

const fetchDocsSsotFixtureText = (basename: string): string => {
  const url = buildDocsSsotDocViewUrl(basename)
  try {
    return execFileSync(
      'curl',
      ['-sS', '--fail', '--max-time', DOCS_SSOT_REQUEST_TIMEOUT_SECONDS, url],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`failed to fetch docs SSOT fixture ${basename} from Cloudflare D1-backed storage route ${url}: ${message}`)
  }
}

const ensureDocsSsotFixtureCache = (basename: string): string => {
  const cachePath = path.resolve(resolveDocsSsotCacheDir(), basename)
  if (fetchedFixturePathByBasename.get(basename) === cachePath && fs.existsSync(cachePath)) {
    return cachePath
  }

  const text = fetchDocsSsotFixtureText(basename)
  if (!text.trim()) {
    throw new Error(`expected docs SSOT fixture ${basename} to contain markdown text`)
  }

  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempPath, text, 'utf8')
  fs.renameSync(tempPath, cachePath)
  fetchedFixtureTextByBasename.set(basename, text)
  fetchedFixturePathByBasename.set(basename, cachePath)
  return cachePath
}

export function resolveDocsSsotValidationFixturePath(): string {
  return resolveDocsSsotFixturePath(DOCS_SSOT_VALIDATION_FIXTURE_BASENAME)
}

export function resolveDocsSsotRootPath(): string {
  return resolveDocsSsotCacheDir()
}

export function resolveDocsSsotFixturePath(basename: string): string {
  const name = normalizeDocsFixtureBasename(basename)
  return ensureDocsSsotFixtureCache(name)
}

export function readDocsSsotFixtureText(basename: string): string {
  const name = normalizeDocsFixtureBasename(basename)
  const cached = fetchedFixtureTextByBasename.get(name)
  if (typeof cached === 'string') return cached
  const fixturePath = resolveDocsSsotFixturePath(name)
  const text = fs.readFileSync(fixturePath, 'utf8')
  fetchedFixtureTextByBasename.set(name, text)
  return text
}
