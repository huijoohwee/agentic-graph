export const AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_SCHEMA = 'agenticgraph-markdown-content-manifest/v1'
export const AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_PATH = '/api/storage/content-manifest.json'
export const AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_SUFFIX = '/content-manifest.json'

export const buildAgenticGraphMarkdownContentManifestPath = (workspaceId?: string | null): string => {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  return normalizedWorkspaceId
    ? `/api/storage/source-files/${encodeURIComponent(normalizedWorkspaceId)}${AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_SUFFIX}`
    : AGENTICGRAPH_MARKDOWN_CONTENT_MANIFEST_PATH
}
