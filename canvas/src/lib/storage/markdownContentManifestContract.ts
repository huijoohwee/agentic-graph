export const AGENTIC_OS_MARKDOWN_CONTENT_MANIFEST_SCHEMA = 'agentic-graph-markdown-content-manifest/v1'
export const AGENTIC_OS_MARKDOWN_CONTENT_MANIFEST_PATH = '/api/storage/content-manifest.json'
export const AGENTIC_OS_MARKDOWN_CONTENT_MANIFEST_SUFFIX = '/content-manifest.json'

export const buildAgenticGraphMarkdownContentManifestPath = (workspaceId?: string | null): string => {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  return normalizedWorkspaceId
    ? `/api/storage/source-files/${encodeURIComponent(normalizedWorkspaceId)}${AGENTIC_OS_MARKDOWN_CONTENT_MANIFEST_SUFFIX}`
    : AGENTIC_OS_MARKDOWN_CONTENT_MANIFEST_PATH
}
