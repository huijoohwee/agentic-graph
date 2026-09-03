import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { readEnvString } from '@/lib/config.env'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const normalizeString = (value: unknown): string => String(value || '').trim()

const TRUTHY_ENV = new Set(['1', 'true', 'yes', 'on'])

export type AgenticGraphGitHubWorkspaceWriteFile = {
  workspacePath: string
  repositoryPath?: string
  action?: 'created' | 'updated'
  commitSha?: string
  contentSha?: string
  htmlUrl?: string
}

export type PublishGeneratedWorkspacePathsToGitHubResult = {
  ok: boolean
  status: 'applied' | 'skipped' | 'failed'
  files: AgenticGraphGitHubWorkspaceWriteFile[]
  error?: string
  reason?: string
}

export const readAgenticGraphGitHubWriteEnabled = (): boolean => {
  const raw = normalizeString(readEnvString('VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED', '')).toLowerCase()
  return TRUTHY_ENV.has(raw)
}

const readAppBasePath = (): string => {
  let raw = '/agentic-graph/'
  try {
    raw = normalizeString(import.meta.env.BASE_URL) || raw
  } catch {
    void 0
  }
  if (!raw.startsWith('/')) raw = `/${raw}`
  raw = raw.replace(/\/+$/, '')
  return raw && raw !== '/' ? raw : '/agentic-graph'
}

export const resolveAgenticGraphGitHubWriteUrl = (baseUrl?: string | null): string => {
  const explicitBase = normalizeString(baseUrl) || normalizeString(readEnvString('VITE_AGENTIC_OS_GITHUB_WRITE_BASE_URL', ''))
  const routePath = `${readAppBasePath()}/api/workspace/github/write`
  if (explicitBase) return new URL(routePath, explicitBase.endsWith('/') ? explicitBase : `${explicitBase}/`).toString()
  if (typeof window !== 'undefined' && normalizeString(window.location?.origin)) {
    return new URL(routePath, window.location.origin).toString()
  }
  return routePath
}

const readSessionIdFromWorkspacePath = (workspacePath: string): string => {
  const parts = normalizeWorkspacePath(workspacePath).split('/').filter(Boolean)
  return parts[0] === 'chat-log' ? normalizeString(parts[1]) : ''
}

const collectGeneratedWorkspaceFilesForGitHub = async (paths: ReadonlyArray<string>): Promise<Array<{ workspacePath: string; text: string }>> => {
  const normalizedPaths = [...new Set(
    (Array.isArray(paths) ? paths : [])
      .map(path => normalizeWorkspacePath(normalizeString(path)))
      .filter(path => path && path !== '/'),
  )]
  if (normalizedPaths.length === 0) return []
  const { getWorkspaceFs } = await import('@/features/workspace-fs/workspaceFs')
  const fs = await getWorkspaceFs()
  const out: Array<{ workspacePath: string; text: string }> = []
  for (const workspacePath of normalizedPaths) {
    const text = await fs.readFileText(workspacePath as WorkspacePath)
    if (typeof text !== 'string') continue
    out.push({ workspacePath, text })
  }
  return out
}

export const publishGeneratedWorkspacePathsToGitHub = async (args: {
  paths: ReadonlyArray<string>
  enabled?: boolean
  baseUrl?: string | null
  fetchImpl?: FetchLike
  message?: string | null
}): Promise<PublishGeneratedWorkspacePathsToGitHubResult> => {
  const enabled = typeof args.enabled === 'boolean' ? args.enabled : readAgenticGraphGitHubWriteEnabled()
  if (!enabled) {
    return { ok: true, status: 'skipped', reason: 'disabled', files: [] }
  }
  const fetchImpl = args.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!fetchImpl) return { ok: false, status: 'failed', error: 'fetch_unavailable', files: [] }

  const files = await collectGeneratedWorkspaceFilesForGitHub(args.paths)
  if (files.length === 0) {
    return { ok: true, status: 'skipped', reason: 'no_text_files', files: [] }
  }

  const sessionId = readSessionIdFromWorkspacePath(files[0]?.workspacePath || '')
  const message = normalizeString(args.message) || (sessionId ? `agentic-graph chat artifacts ${sessionId}` : 'agentic-graph chat artifacts')
  const response = await fetchImpl(resolveAgenticGraphGitHubWriteUrl(args.baseUrl), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ files, message }),
  })
  const payload = await response.json().catch(() => null) as Partial<PublishGeneratedWorkspacePathsToGitHubResult> | null
  if (!response.ok || payload?.ok !== true) {
    return {
      ok: false,
      status: 'failed',
      error: normalizeString(payload?.error) || `github_write_failed:${response.status}`,
      files: Array.isArray(payload?.files) ? payload.files : [],
    }
  }
  return {
    ok: true,
    status: 'applied',
    files: Array.isArray(payload.files) ? payload.files : files.map(file => ({ workspacePath: file.workspacePath })),
  }
}
