import { openMarkdownWorkspacePathInExplorer } from '@/features/markdown-workspace/openMarkdownWorkspacePathInExplorer'
import { activateFirstImportedWorkspaceFile } from '@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { normalizeWorkspacePath, splitWorkspacePath } from '@/features/workspace-fs/path'
import { setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { upsertWorkspaceTextDocument } from '@/features/workspace-fs/upsertWorkspaceTextDocument'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { notifyWorkspaceFsChanged } from '@/features/workspace-fs/workspaceFsEvents'
import {
  WEBSITE_CRAWL_ARTIFACT_QUERY_PARAM,
  WEBSITE_CRAWL_SOURCE_URL_QUERY_PARAM,
} from '@/lib/websites/websiteCrawlTablePanel'

export type WebsiteCrawlMarkdownDeepLinkRequest = {
  artifactHref: string
  sourceUrl: string
  workspacePath: string
}

export function parseWebsiteCrawlMarkdownDeepLinkHref(href: unknown): WebsiteCrawlMarkdownDeepLinkRequest | null {
  const raw = String(href || '').trim()
  if (!raw) return null
  const baseOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://agentic-graph.local'
  let url: URL
  try {
    url = new URL(raw, `${baseOrigin}/`)
  } catch {
    return null
  }
  if (url.origin !== baseOrigin || url.pathname !== '/') return null
  const artifactHref = String(url.searchParams.get(WEBSITE_CRAWL_ARTIFACT_QUERY_PARAM) || '').trim()
  const sourceUrl = String(url.searchParams.get(WEBSITE_CRAWL_SOURCE_URL_QUERY_PARAM) || '').trim()
  const workspacePath = String(url.searchParams.get('kgDoc') || '').trim()
  return artifactHref && workspacePath ? { artifactHref, sourceUrl, workspacePath } : null
}

export function readWebsiteCrawlMarkdownDeepLinkRequest(): WebsiteCrawlMarkdownDeepLinkRequest | null {
  if (typeof window === 'undefined') return null
  return parseWebsiteCrawlMarkdownDeepLinkHref(window.location.href)
}

export function consumeWebsiteCrawlMarkdownDeepLinkRequest(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete(WEBSITE_CRAWL_ARTIFACT_QUERY_PARAM)
  url.searchParams.delete(WEBSITE_CRAWL_SOURCE_URL_QUERY_PARAM)
  url.searchParams.delete('kgDoc')
  const currentState = window.history.state
  window.history.replaceState(currentState, '', `${url.pathname}${url.search}${url.hash}`)
  try {
    window.dispatchEvent(new PopStateEvent('popstate', { state: currentState }))
  } catch {
    window.dispatchEvent(new Event('popstate'))
  }
}

export async function openWebsiteCrawlMarkdownArtifactInExplorer(args: {
  artifactHref: string
  sourceUrl?: string | null
  workspacePath: string
}): Promise<string | null> {
  const workspacePath = normalizeWorkspacePath(args.workspacePath) as WorkspacePath
  const artifactHref = String(args.artifactHref || '').trim()
  if (!workspacePath.startsWith('/websites/') || !workspacePath.toLowerCase().endsWith('.md')) return null
  if (!artifactHref.startsWith('/__website_import/artifact?') || !/(?:^|[?&])kind=markdown(?:&|$)/.test(artifactHref)) return null

  const fs = await getWorkspaceFs()
  await fs.ensureSeed()
  let existingText = await fs.readFileText(workspacePath).catch(() => null)
  if (existingText == null) {
    const response = await fetch(artifactHref, { headers: { Accept: 'text/markdown, text/plain;q=0.9' } })
    if (!response.ok) return null
    existingText = await response.text()
    const parts = splitWorkspacePath(workspacePath)
    const name = parts.pop() || 'page.md'
    const parentPath = normalizeWorkspacePath(parts.join('/')) as WorkspacePath
    await ensureWorkspaceFolderTreeIfMissing({ folderPath: parentPath, fs })
    await upsertWorkspaceTextDocument({ fs, parentPath, name, text: existingText })
  }

  const sourceUrl = String(args.sourceUrl || '').trim()
  if (/^https?:\/\//i.test(sourceUrl)) {
    setWorkspaceEntrySource(workspacePath, { kind: 'url', url: sourceUrl }, { persist: 'sync' })
  }
  await applyWorkspaceImportToCanvas({
    fs,
    createdPaths: [workspacePath],
    opts: { applyToGraph: false, skipComposedGraphApply: true },
  })
  const activated = await activateFirstImportedWorkspaceFile({ fs, createdPaths: [workspacePath], applyToGraph: false })
  if (!activated) return null
  notifyWorkspaceFsChanged({ op: 'batch', path: workspacePath })
  return openMarkdownWorkspacePathInExplorer(workspacePath)
}
