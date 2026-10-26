import { extractYamlFrontmatterHeaderBlock, readYamlFrontmatterValue } from '@/lib/markdown/frontmatter'
import type { WorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'

export function readWorkspaceImportMarkdownSourceUrl(text: string): string {
  const header = extractYamlFrontmatterHeaderBlock(String(text || ''))
  return header ? readYamlFrontmatterValue(header.rawBlock, 'kgWebpageUrl').trim() : ''
}

export function resolveWorkspaceImportSourceUrl(source: WorkspaceEntrySource | undefined, text: string): string {
  const frontmatterUrl = readWorkspaceImportMarkdownSourceUrl(text)
  if (frontmatterUrl) return frontmatterUrl
  return source?.kind === 'url' ? String(source.url || '').trim() : ''
}

export function normalizeWorkspaceImportSourceUrlIdentity(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    url.hash = ''
    url.protocol = url.protocol.toLowerCase()
    url.hostname = url.hostname.toLowerCase()
    url.pathname = url.pathname.replace(/\/+$/g, '') || '/'
    return url.toString()
  } catch {
    return raw.replace(/#.*$/g, '').replace(/\/+$/g, '').trim()
  }
}

export function workspaceImportSourceUrlsMatch(a: string, b: string): boolean {
  const left = normalizeWorkspaceImportSourceUrlIdentity(a)
  const right = normalizeWorkspaceImportSourceUrlIdentity(b)
  return !!left && !!right && left === right
}

export function shouldAcceptWorkspaceImportSourceContent(
  requestedUrl: string,
  responseSourceUrl: string | undefined,
  sessionSourceUrl: string | undefined,
): boolean {
  const responseUrl = String(responseSourceUrl || '').trim()
  if (responseUrl) return workspaceImportSourceUrlsMatch(requestedUrl, responseUrl)
  return workspaceImportSourceUrlsMatch(requestedUrl, String(sessionSourceUrl || ''))
}
