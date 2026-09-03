import { onRequest, buildAgentReadyStaticFiles } from '../../../cloudflare/pages/agentic-graph-agent-ready.mjs'
import { buildMarkdownContentManifest, isDiscoverableCrawlerDocument, isAgenticGraphStorageCrawlerRoute } from '../../../cloudflare/workers/agentic-graph-storage/crawler'
import { AGENTIC_OS_MARKDOWN_CONTENT_MANIFEST_SCHEMA, buildAgenticGraphMarkdownContentManifestPath } from '@/lib/storage/markdownContentManifestContract'

export async function testAgentMarkdownDiscoveryUsesCanonicalMachineRoutes(): Promise<void> {
  const staticArtifacts = await buildAgentReadyStaticFiles()
  const rootLlms = staticArtifacts['llms.txt']
  const sitemap = staticArtifacts['sitemap.xml']
  if (rootLlms?.contentType !== 'text/plain; charset=utf-8' || !rootLlms.body.includes('https://airvio.co/agentic-graph/llms.txt') || !rootLlms.body.includes('https://airvio.co/agentic-graph/.well-known/openapi.json')) {
    throw new Error(`expected canonical root llms.txt discovery, got ${JSON.stringify(rootLlms)}`)
  }
  if (!sitemap?.body.includes('https://airvio.co/llms.txt') || !sitemap.body.includes('https://airvio.co/api/storage/llms.txt')) {
    throw new Error(`expected sitemap agent discovery entries, got ${JSON.stringify(sitemap)}`)
  }
  for (const [aliasPath, canonicalPath] of [
    ['/agentic-graph/openapi.json', '/agentic-graph/.well-known/openapi.json'],
    ['/agentic-graph/api-catalog.json', '/agentic-graph/.well-known/api-catalog'],
  ]) {
    const response = await onRequest({ request: new Request(`https://airvio.co${aliasPath}`), env: {}, next: async () => new Response('unexpected SPA fallback') } as never)
    if (response.status !== 308 || new URL(String(response.headers.get('location'))).pathname !== canonicalPath) {
      throw new Error(`expected ${aliasPath} to redirect to ${canonicalPath}`)
    }
  }
}

export function testAgentMarkdownDiscoveryExcludesEmptyPlaceholders(): void {
  const base = { id: 'doc', canonicalPath: 'docs/example.md' }
  if (!isDiscoverableCrawlerDocument({ ...base, contentLength: 1 })) throw new Error('expected non-empty Markdown discovery')
  if (isDiscoverableCrawlerDocument({ ...base, contentLength: 0 })) throw new Error('expected empty placeholder exclusion')
}

export function testAgentMarkdownDiscoveryBuildsEditorWorkspaceManifest(): void {
  const manifestPath = buildAgenticGraphMarkdownContentManifestPath()
  if (manifestPath !== '/api/storage/content-manifest.json' || !isAgenticGraphStorageCrawlerRoute(manifestPath)) {
    throw new Error(`expected default Markdown manifest route, got ${manifestPath}`)
  }
  const manifest = buildMarkdownContentManifest({
    requestUrl: `https://airvio.co${manifestPath}`,
    workspaceId: 'kgws:canonical-docs',
    exportedAtIso: '2026-07-11T00:00:00.000Z',
    documents: [{ id: 'doc', canonicalPath: 'docs/example.md', title: 'Example', docType: 'guide', contentHash: 'sha256:example', revision: 2, updatedAt: '2026-07-11T00:00:00.000Z', contentLength: 42 }],
  }) as { schema?: string, documents?: Array<Record<string, unknown>> }
  const document = manifest.documents?.[0]
  if (manifest.schema !== AGENTIC_OS_MARKDOWN_CONTENT_MANIFEST_SCHEMA || document?.source_path !== 'docs/example.md' || document?.canonical_url !== 'https://airvio.co/agentic-graph/doc-default/docs%2Fexample.md' || document?.markdown_url !== 'https://airvio.co/api/storage/doc-default/docs%2Fexample.md') {
    throw new Error(`expected Editor Workspace source to generate canonical HTML and Markdown projections, got ${JSON.stringify(manifest)}`)
  }
}
