import { importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'

type GlobalWithFetch = typeof globalThis & { fetch?: typeof fetch }

export async function testWorkspaceImportUrlImportRejectsUnrecoveredHydrationShellBeforePersistence(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const shellHtml = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<title>Claude</title>',
    '<script>window.__APP_STATE__={}</script>',
    '</head>',
    '<body>',
    '<section id="root"></section>',
    '<script src="/assets/app.js"></script>',
    '</body>',
    '</html>',
  ].join('')
  const calls: string[] = []
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    calls.push(requestUrl)
    if (!requestUrl.startsWith('/__webpage_proxy?')) {
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }
    return new Response(shellHtml, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async () => null)
  try {
    const rejected = await importWorkspaceUrl({
      fs: createMemoryWorkspaceFs(),
      urlRaw: url,
      viewHint: 'markdown',
    }).then(() => false, e => String((e as { message?: unknown })?.message || e).includes('authentication or loading shell'))
    if (!rejected) throw new Error('expected unrecovered hydration shell import to reject instead of persisting a low-fidelity docs_ artifact')
    if (!calls.some(call => call.startsWith('/__webpage_proxy?'))) throw new Error('expected shared webpage proxy to be attempted before shell rejection')
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}
