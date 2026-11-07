import { fetchWorkspaceUrlContent } from '@/features/markdown-workspace/workspaceImport'
import { setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'

type GlobalWithFetch = typeof globalThis & { fetch?: typeof fetch }

export async function testWorkspaceImportUrlRejectsApiNativeBrowserSessionSourceMismatch(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/share/75ffdfb2-c40d-4838-be28-e04fe62021f5'
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown, init?: RequestInit) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    if (requestUrl.startsWith('/__webpage_proxy?')) {
      return new Response('<main><h1>Can&apos;t reach Claude</h1><p>Check your connection.</p><button>Try again</button></main>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    if (requestUrl === 'http://localhost:6969/v1/sessions') {
      return new Response(JSON.stringify({ sessions: [{ id: 'claude-session-1', url, domain: 'claude.ai', title: 'Claude' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (requestUrl === 'http://localhost:6969/v1/browser/markdown') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      if (body.session_id !== 'claude-session-1' || body.url !== url) throw new Error(`expected matching browser request, got ${JSON.stringify(body)}`)
      return new Response(JSON.stringify({
        url: 'http://127.0.0.1:5173/',
        markdown: 'Enable Runtime Auto Scroll\n\nExplorer\n\nSource Files\n\nThis local workspace chrome must not be persisted.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async () => ({
    text: "Can't reach Claude\n\nCheck your connection.\n\nTry again",
    title: 'Claude',
    clipped: false,
  }))
  try {
    let rejected = false
    try {
      await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    } catch (e) {
      rejected = true
      const message = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message || '') : ''
      if (!/authentication or loading shell/i.test(message)) throw e
    }
    if (!rejected) throw new Error('expected mismatched API-native browser content to be rejected before persistence')
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}
