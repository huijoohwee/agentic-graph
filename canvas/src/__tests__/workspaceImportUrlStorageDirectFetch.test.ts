import { fetchWorkspaceUrlContent, importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { type GlobalWithFetch } from './helpers/workspaceImportUrlFixtures'

export async function testWorkspaceImportUrlFetchesRootRelativeStorageMarkdownAsUrl(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const g = globalThis as GlobalWithFetch
  const prev = g.fetch
  const calls: string[] = []
  g.fetch = (async (input: unknown) => {
    const calledUrl = input instanceof URL ? input.toString() : String(input || '')
    calls.push(calledUrl)
    return new Response('# Shared Storage Doc\n\nFetched from storage.\n', {
      status: 200,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    })
  }) as unknown as typeof fetch
  try {
    const sourceUrls = [
      '/api/storage/doc-default/huijoohwee%2Fdocs%2Fshared-storage-doc.md',
      'https://airvio.co/api/storage/doc-default/huijoohwee%2Fdocs%2Fshared-storage-doc.md',
    ]
    for (const sourceUrl of sourceUrls) {
      calls.length = 0
      const res = await fetchWorkspaceUrlContent(sourceUrl, { mode: 'import', viewHint: 'markdown' })
      const expectedFetchUrl = new URL(sourceUrl, 'https://airvio.co').toString()
      const normalizedCalls = calls.map(call => new URL(call, 'https://airvio.co').toString())
      if (normalizedCalls.length === 0 || normalizedCalls.some(call => call !== expectedFetchUrl)) {
        throw new Error(`expected storage markdown to fetch directly from ${expectedFetchUrl}, got ${calls.join(',')}`)
      }
      if (calls.some(call => call.includes('/__codebase_file') || call.includes('/@fs') || call.includes('/__fetch_remote'))) {
        throw new Error(`expected storage URL import to avoid local/proxy fetch fallbacks, got ${calls.join(',')}`)
      }
      if (res.name !== 'huijoohwee/docs/shared-storage-doc.md') {
        throw new Error(`expected storage URL import to preserve the decoded canonical path, got ${res.name}`)
      }
      if (res.normalizedUrl !== sourceUrl) {
        throw new Error(`expected storage URL identity to be preserved, got ${res.normalizedUrl}`)
      }
      if (!res.text.includes('Shared Storage Doc')) {
        throw new Error('expected storage markdown body to be imported verbatim')
      }
      const fs = createMemoryWorkspaceFs()
      const imported = await importWorkspaceUrl({
        fs,
        urlRaw: sourceUrl,
        viewHint: 'markdown',
        mirrorToHost: false,
        fetchUrlContent: async () => res,
      })
      if (imported.createdPaths.length !== 1 || imported.createdPaths[0] !== '/huijoohwee/docs/shared-storage-doc.md') {
        throw new Error(`expected storage URL import to materialize the canonical workspace path, got ${JSON.stringify(imported.createdPaths)}`)
      }
      const importedText = await fs.readFileText('/huijoohwee/docs/shared-storage-doc.md')
      if (!importedText?.includes('Shared Storage Doc')) {
        throw new Error('expected canonical storage path import to persist fetched markdown text')
      }
    }
  } finally {
    g.fetch = prev
    resetWorkspaceUrlContentCacheForTests()
  }
}
