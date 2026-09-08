import { isFrontmatterOnlyDoc } from '@/lib/markdown/frontmatter'
import { fetchWorkspaceUrlContent } from '@/features/markdown-workspace/workspaceImport'
import { setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'

const BYTEPLUS_TEST_URL =
  'https://api.byteplus.com/api-sdk/view?serviceCode=ecs&version=2020-04-01&language=Python'
const WEBPAGE_TEST_URL = 'https://docs.byteplus.com/'

export async function testMarkdownWorkspaceImportUrlHtmlPageSsotAndViewModes() {
  resetWorkspaceUrlContentCacheForTests()
  const importUrl = `${BYTEPLUS_TEST_URL}?import-e2e=1`
  const prevFetch = (globalThis as unknown as { fetch?: unknown }).fetch
  const htmlBody =
    `<!doctype html><html><head><base href="${WEBPAGE_TEST_URL}"></head><body><h1>BytePlus ECS Python SDK</h1><p>Section 1</p><p>Section 2</p></body></html>`
  // This contract exercises fetched HTML recovery. Iframe export has separate
  // browser contracts and must not contact an unserved proxy in this fixture.
  setWorkspaceWebpageDomExportForTests(async () => null)
  try {
    ;(globalThis as unknown as { fetch?: unknown }).fetch = (async (input: unknown, init?: unknown) => {
      const initObj = init && typeof init === 'object' ? (init as { method?: unknown }) : null
      const methodRaw = initObj?.method
      const method = (typeof methodRaw === 'string' ? methodRaw : 'GET').toUpperCase()

      const url = input instanceof URL ? input.toString() : typeof input === 'string' ? input : ''
      if (url.includes('/__fetch_remote')) {
        throw new Error(`expected webpage import to avoid __fetch_remote, got ${url}`)
      }
      if (url.includes('/__webpage_proxy') && method === 'HEAD') {
        const res = {
          ok: true,
          status: 200,
          headers: {
            get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null),
          },
          text: async () => '',
        }
        return res as unknown as Response
      }
      const res = {
        ok: true,
        status: 200,
        headers: {
          get: () => null,
        },
        text: async () => (method === 'HEAD' ? '' : htmlBody),
      }
      return res as unknown as Response
    }) as unknown

    const imported = await fetchWorkspaceUrlContent(importUrl, { mode: 'import' })
    if (imported.normalizedUrl !== importUrl) {
      throw new Error('expected normalizedUrl to equal input URL for Import URL pipeline')
    }
    if (!imported.name || !imported.name.endsWith('.md')) {
      throw new Error('expected Import URL pipeline to derive a .md file name')
    }
    const frontmatterPrefix = imported.text.split('\n').slice(0, 12).join('\n')
    if (!frontmatterPrefix.includes(`kgWebpageUrl: "${importUrl}"`)) {
      throw new Error('expected frontmatter to include kgWebpageUrl with BytePlus URL')
    }
    if (!frontmatterPrefix.includes('kgWebpageView: "html"')) {
      throw new Error('expected frontmatter to set kgWebpageView: "html"')
    }
    if (frontmatterPrefix.includes('kgWebpageScriptPolicy:')) {
      throw new Error('expected Import URL to keep Script: Auto (omit kgWebpageScriptPolicy)')
    }
    if (frontmatterPrefix.includes('kgWebpageIncludeImages:')) {
      throw new Error('expected Import URL to omit explicit kgWebpageIncludeImages and auto-route image inclusion')
    }
    if (frontmatterPrefix.includes('kgWebpageFidelityLevel:')) {
      throw new Error('expected Import URL to keep Fid: Auto (omit kgWebpageFidelityLevel)')
    }
    if (imported.text.includes('Fetching content in background')) {
      throw new Error('expected Import URL to write parsed content without a background placeholder')
    }
    if (isFrontmatterOnlyDoc(imported.text)) {
      throw new Error('expected Import URL to have non-empty body, not frontmatter-only')
    }
    if (!imported.text.includes('ECS Python SDK')) {
      throw new Error('expected Import URL body to include heading derived from HTML')
    }

    const refreshed = await fetchWorkspaceUrlContent(importUrl, { mode: 'refresh' })
    if (refreshed.normalizedUrl !== importUrl) {
      throw new Error('expected normalizedUrl to equal input URL for refresh mode')
    }
    if (!refreshed.name || !refreshed.name.endsWith('.md')) {
      throw new Error('expected refresh mode to derive a .md file name')
    }
    if (!refreshed.text.includes(`kgWebpageUrl: "${importUrl}"`)) {
      throw new Error('expected refresh markdown to include kgWebpageUrl with BytePlus URL')
    }
    if (!refreshed.text.includes('kgWebpageView: "html"')) {
      throw new Error('expected refresh markdown to keep kgWebpageView: "html" in frontmatter')
    }
    if (isFrontmatterOnlyDoc(refreshed.text)) {
      throw new Error('expected refresh markdown to have non-empty body, not frontmatter-only')
    }
    if (!refreshed.text.includes('ECS Python SDK')) {
      throw new Error('expected refresh markdown to include heading derived from HTML')
    }
    if (!refreshed.text.includes('Section 1') || !refreshed.text.includes('Section 2')) {
      throw new Error('expected refresh markdown to include HTML paragraph text')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    ;(globalThis as unknown as { fetch?: unknown }).fetch = prevFetch
  }
}
