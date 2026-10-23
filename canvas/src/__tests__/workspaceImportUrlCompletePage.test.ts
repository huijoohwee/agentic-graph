import { fetchWorkspaceUrlContent, importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { discoverAuthenticatedWebsitePages } from '@/features/markdown-workspace/workspaceImport/apiNativeWebsiteCrawl'
import { setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { fetchWebpageHtmlViaProxy } from '@/lib/websites/webpageIframeSrcdoc'
import { installUnavailableWebpageDomFixture, installWebpageProxyFetch } from './helpers/workspaceImportUrlFixtures'
import { resolveWorkspaceImportSourceUrl } from '@/features/markdown-workspace/workspaceImport/sourceUrlIdentity'
import { looksLikeIncompleteWebpageMarkdown } from '@/features/markdown-workspace/workspaceImport/webpageMarkdownFidelity'
import { sourceFileWebsiteUrl } from '@/features/source-files/websiteImportTreeProjection'
import { captureWorkspacePageFromClipboard, captureWorkspacePageFromContent } from '@/features/markdown-workspace/workspaceImport/urlContentHtml'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'

type GlobalWithFetch = typeof globalThis & { fetch?: typeof fetch }

export async function testAuthenticatedWebsiteCrawlFollowsRenderedSameSiteLinks(): Promise<void> {
  const rootUrl = 'https://example.test/introduction'
  const pagesByUrl: Record<string, string> = {
    [rootUrl]: '[Comparison](/comparison) [Chapter one](/guide/chapter-one) [external](https://elsewhere.test/ignore)\n\n' + 'Rendered introduction content remains available in the authenticated browser session. '.repeat(5),
    'https://example.test/comparison': '[Chapter two](../guide/chapter-two)\n\n' + 'Rendered comparison content remains available in the authenticated browser session. '.repeat(5),
    'https://example.test/guide/chapter-one': '[Chapter two](./chapter-two)\n\n' + 'Rendered chapter content remains available in the authenticated browser session. '.repeat(5),
    'https://example.test/guide/chapter-two': 'Final guide page content is readable from the authenticated browser session. '.repeat(5),
  }
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  const calls: string[] = []
  g.fetch = (async (input: unknown, init?: RequestInit) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    calls.push(requestUrl)
    if (requestUrl === 'http://localhost:6969/v1/sessions') {
      return new Response(JSON.stringify({ sessions: [{ id: 'authenticated-site', url: rootUrl, domain: 'example.test' }] }), { status: 200 })
    }
    if (requestUrl === 'http://localhost:6969/v1/browser/markdown') {
      const body = JSON.parse(String(init?.body || '{}')) as { url?: string; session_id?: string }
      if (body.session_id !== 'authenticated-site') throw new Error('Expected crawl requests to stay in the discovered authenticated session')
      const markdown = pagesByUrl[String(body.url || '')]
      return markdown
        ? new Response(JSON.stringify({ title: 'Rendered page', source_url: body.url, markdown }), { status: 200 })
        : new Response('missing page', { status: 404 })
    }
    return new Response('not found', { status: 404 })
  }) as unknown as typeof fetch
  try {
    const result = await discoverAuthenticatedWebsitePages({ rootUrl, url: rootUrl })
    const urls = result?.pages.map(page => page.url) || []
    if (!result || result.limited) throw new Error('Expected the authenticated website crawl to finish within its route budget')
    if (urls.length !== 4 || !urls.includes('https://example.test/guide/chapter-two')) {
      throw new Error(`Expected recursive same-site route discovery, received ${JSON.stringify(urls)}`)
    }
    if (urls.some(url => url.includes('elsewhere.test'))) throw new Error('Expected the authenticated crawl to exclude off-site links')
    if (calls.filter(url => url.endsWith('/v1/sessions')).length !== 4) throw new Error('Expected each page read to revalidate the browser session before navigation')
  } finally {
    g.fetch = previousFetch
  }
}

export async function testWorkspaceImportUrlHonorsExactDestinationAndRejectsForeignContent(): Promise<void> {
  const fs = createMemoryWorkspaceFs()
  const url = 'https://example.test/guide/chapter-one'
  const destinationPath = '/websites/example.test/guide/chapter-one.md'
  const pageText = `---\nkgWebpageUrl: "${url}"\nkgWebpageView: markdown\n---\n\n# Chapter one\n\n${'Complete authenticated page content. '.repeat(8)}`
  const importPage = (targetPath: string) => importWorkspaceUrl({
    fs,
    urlRaw: url,
    destinationPath: targetPath,
    mirrorToHost: false,
    fetchUrlContent: async rawUrl => ({ normalizedUrl: rawUrl, name: 'chapter-one.md', text: pageText }),
  })

  const imported = await importPage(destinationPath)
  if (imported.createdPaths.length !== 1 || imported.createdPaths[0] !== destinationPath) {
    throw new Error(`Expected the selected page destination to be honored, got ${JSON.stringify(imported.createdPaths)}`)
  }
  if (await fs.readFileText(destinationPath) !== pageText) {
    throw new Error('Expected complete authenticated page content at the exact selected destination')
  }

  const foreignPath = '/websites/example.test/guide/foreign.md'
  const foreignText = `---\nkgWebpageUrl: "https://example.test/another-page"\n---\n\nKeep this document.`
  await fs.createFile({ parentPath: '/websites/example.test/guide', name: 'foreign.md', text: foreignText })
  const error = await importPage(foreignPath).then(() => '', failure => String((failure as Error).message || failure))
  if (!error.includes('belongs to another document') || await fs.readFileText(foreignPath) !== foreignText) {
    throw new Error('Expected an occupied destination owned by another URL to fail without replacing its document')
  }
}

export async function testWorkspaceImportUrlKeepsIndexAndBodyBeyondDefaultFetchLimit(): Promise<void> {
  const url = 'https://example.test/complete-page'
  const savedMarkdown = `---\nkgWebpageUrl: "${url}"\nkgWebpageView: markdown\n---\nSaved article text.`
  if (resolveWorkspaceImportSourceUrl(undefined, savedMarkdown) !== url) {
    throw new Error('Expected a saved webpage document to resolve its URL without a source-index entry')
  }
  const savedEntry: WorkspaceEntry = { path: '/article.md', parentPath: null, kind: 'file', name: 'article.md', text: savedMarkdown, updatedAtMs: 0 }
  if (sourceFileWebsiteUrl(savedEntry) !== url) throw new Error('Expected the per-file refresh action to be available from webpage frontmatter')
  const payload = `INERT_SCRIPT_PAYLOAD_SENTINEL${'x'.repeat(5_100_000)}`
  const sections = Array.from({ length: 40 }, (_, index) =>
    `<section id="lesson-${index + 1}"><h2>Lesson ${index + 1}</h2><p>${'Complete lesson body text remains available after import. '.repeat(3)}</p></section>`,
  ).join('')
  const longBodyText = Array.from({ length: 20_000 }, (_, index) =>
    `Visible body segment ${String(index).padStart(5, '0')} includes distinct complete lesson text beyond the previous Markdown limit.`,
  ).join('\n')
  const html = [
    '<!doctype html><html><head><title>Complete page</title>',
    `<script>window.__payload = "${payload}"</script>`,
    '</head><body><nav aria-label="Page index"><a href="#lesson-1">Index first lesson</a><a href="#lesson-40">Index last lesson</a></nav>',
    `<main><h1>Complete page</h1>${sections}<p>Final lesson body marker.</p><p>${longBodyText}</p></main></body></html>`,
  ].join('')
  const calls: string[] = []
  const restoreFetch = installWebpageProxyFetch(new Map([[url, html]]), calls)
  const domFixture = installUnavailableWebpageDomFixture([url])
  resetWorkspaceUrlContentCacheForTests()
  try {
    const imported = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!imported.text.includes('Index first lesson') || !imported.text.includes('Index last lesson')) {
      throw new Error('Expected direct Import URL to preserve the page index navigation')
    }
    if (!imported.text.includes('Final lesson body marker.')) {
      throw new Error('Expected direct Import URL to preserve the complete page body after large non-rendered markup')
    }
    if (imported.text.length <= 1_500_000 || !imported.text.includes('Visible body segment 19999')) {
      throw new Error('Expected direct Import URL to preserve visible content beyond the prior 1.5 million character limit')
    }
    if (imported.text.includes('INERT_SCRIPT_PAYLOAD_SENTINEL') || imported.text.includes('<script')) {
      throw new Error('Expected non-rendered script payloads to be excluded from imported Markdown')
    }
    if (!calls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('Expected the shared webpage proxy ingestion path')
    }
  } finally {
    domFixture.restore()
    restoreFetch()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlNormalizedPageBudgetRejectsInsteadOfReturningPrefix(): Promise<void> {
  const url = 'https://example.test/normalized-budget'
  const html = `<main>${'x'.repeat(10_000_001)}</main>`
  const restoreFetch = installWebpageProxyFetch(new Map([[url, html]]), [])
  resetWorkspaceUrlContentCacheForTests()
  let failure: unknown
  try {
    await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
  } catch (error) {
    failure = error
  } finally {
    restoreFetch()
    resetWorkspaceUrlContentCacheForTests()
  }
  if ((failure as { code?: unknown })?.code === 'HTML_INPUT_LIMIT_EXCEEDED') return
  throw new Error('Expected an over-budget Import URL to fail without returning a partial page or fallback stub')
}

export async function testWorkspaceImportUrlRecoversSparseShellFromRenderedDom(): Promise<void> {
  const url = 'https://example.test/rendered-shell-recovery'
  const shellHtml = '<!doctype html><html><body><a href="#content">Skip to content</a><iframe width="0" height="0" src="/frame"></iframe><img width="1" height="1" src="/pixel"></body></html>'
  const renderedBody = 'This rendered lesson body contains the complete readable page content recovered from the browser document. '.repeat(8)
  const renderedHtml = `<!doctype html><html><body><main><h1>Rendered lesson</h1><p>${renderedBody}</p><p>Rendered lesson final section marker.</p></main></body></html>`
  const restoreFetch = installWebpageProxyFetch(new Map([[url, shellHtml]]), [])
  const domModes: string[] = []
  setWorkspaceWebpageDomExportForTests(async args => {
    domModes.push(args.mode)
    return { text: args.mode === 'html' ? renderedHtml : `${renderedBody} Rendered lesson final section marker.`, title: 'Rendered lesson', clipped: false }
  })
  resetWorkspaceUrlContentCacheForTests()
  try {
    const imported = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!imported.text.includes('Rendered lesson final section marker.')) {
      throw new Error('Expected a sparse initial shell to recover the rendered page body')
    }
    if (!domModes.includes('html')) throw new Error('Expected Import URL recovery to inspect rendered HTML')
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restoreFetch()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlExpandsSemanticCollapsedContent(): Promise<void> {
  const url = 'https://example.test/collapsed-content'
  const visibleText = 'The visible guide content remains part of the original page. '.repeat(24)
  const expandedText = 'This section is available after its semantic disclosure control is expanded. '.repeat(5)
  const collapsedHtml = `<!doctype html><html><head><title>Disclosure import</title></head><body>
    <main><h1>Disclosure import</h1>
      <button id="owns" aria-expanded="false" aria-controls="owns-panel">Owns</button>
      <section id="owns-panel" hidden></section><p>${visibleText}</p>
    </main>
  </body></html>`
  const expandedHtml = `<!doctype html><html><head><title>Disclosure import</title></head><body>
    <main><h1>Disclosure import</h1>
      <button id="owns" aria-expanded="true" aria-controls="owns-panel">Owns</button>
      <section id="owns-panel"><h2>Owns</h2><p>${expandedText}</p></section>
      <p>${visibleText}</p>
    </main>
  </body></html>`
  const restoreFetch = installWebpageProxyFetch(new Map([[url, collapsedHtml]]), [])
  const scriptModes: boolean[] = []
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode !== 'html') throw new Error('Expected expanded HTML capture to preserve structure')
    scriptModes.push(args.preferScriptDisabled === true)
    return {
      text: args.preferScriptDisabled ? collapsedHtml : expandedHtml,
      title: 'Disclosure import',
      clipped: false,
    }
  })
  resetWorkspaceUrlContentCacheForTests()
  try {
    const imported = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!imported.text.includes(expandedText.slice(0, 54))) {
      throw new Error(`Expected URL import to include collapsed section content; capture modes=${JSON.stringify(scriptModes)}, imported=${imported.text.slice(0, 700)}`)
    }
    if (scriptModes.length !== 2 || scriptModes[0] !== true || scriptModes[1] !== false) {
      throw new Error(`Expected collapsed content to trigger one script-enabled capture, got ${JSON.stringify(scriptModes)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restoreFetch()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceRefreshRecoversExpandedEmptySections(): Promise<void> {
  const url = 'https://example.test/refresh-expanded-content'
  const visibleText = 'The visible overview remains readable while the page disclosure contents are collapsed. '.repeat(32)
  const expandedText = 'The expanded section body remains available after the disclosure is opened. '.repeat(6)
  const collapsedHtml = `<!doctype html><html><head><title>Refresh disclosure</title></head><body>
    <main><h1>Refresh disclosure</h1>
      <button id="section" aria-expanded="false" aria-controls="section-panel">Owns</button>
      <section id="section-panel" hidden></section>
      <h3>Owns</h3><h3>Doesn't own</h3>
      <p>${visibleText}</p>
    </main>
  </body></html>`
  const expandedHtml = `<!doctype html><html><head><title>Refresh disclosure</title></head><body>
    <main><h1>Refresh disclosure</h1>
      <button id="section" aria-expanded="true" aria-controls="section-panel">Owns</button>
      <section id="section-panel"><h3>Owns</h3><p>${expandedText}</p></section>
      <h3>Doesn't own</h3>
      <p>${visibleText}</p>
    </main>
  </body></html>`
  const calls: string[] = []
  const restoreFetch = installWebpageProxyFetch(new Map([[url, collapsedHtml]]), calls)
  const scriptModes: boolean[] = []
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode !== 'html') throw new Error('Expected expanded refresh capture to preserve page structure')
    scriptModes.push(args.preferScriptDisabled === true)
    return {
      text: args.preferScriptDisabled ? collapsedHtml : expandedHtml,
      title: 'Refresh disclosure',
      clipped: false,
    }
  })
  resetWorkspaceUrlContentCacheForTests()
  try {
    const refreshed = await fetchWorkspaceUrlContent(url, { mode: 'refresh', viewHint: 'markdown', bypassCache: true })
    if (!refreshed.text.includes(expandedText.slice(0, 56))) {
      throw new Error(`Expected source refresh to retain expanded disclosure content; capture modes=${JSON.stringify(scriptModes)}, refreshed=${refreshed.text.slice(0, 700)}`)
    }
    if (scriptModes.length !== 2 || scriptModes[0] !== true || scriptModes[1] !== false) {
      throw new Error(`Expected refresh to expand disclosed content in one script-enabled capture, got ${JSON.stringify(scriptModes)}`)
    }
    if (!calls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('Expected the refresh to inspect converted source Markdown before recovering empty sections')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restoreFetch()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlRejectsSparseShellWhenRenderedContentIsUnavailable(): Promise<void> {
  const url = 'https://example.test/unavailable-rendered-shell'
  const shellHtml = '<!doctype html><html><body><a href="#content">Skip to content</a><iframe width="0" height="0" src="/frame"></iframe><img width="1" height="1" src="/pixel"></body></html>'
  const restoreFetch = installWebpageProxyFetch(new Map([[url, shellHtml]]), [])
  const domFixture = installUnavailableWebpageDomFixture([url])
  resetWorkspaceUrlContentCacheForTests()
  let failure: unknown
  try {
    await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
  } catch (error) {
    failure = error
  } finally {
    domFixture.assertRequests()
    domFixture.restore()
    restoreFetch()
    resetWorkspaceUrlContentCacheForTests()
  }
  if ((failure as { code?: unknown })?.code === 'WEBPAGE_CONTENT_INCOMPLETE') return
  throw new Error('Expected an incomplete page shell to fail instead of importing a navigation-only stub')
}

export async function testWorkspaceImportUrlRecoversAuthenticationShellFromBrowserSession(): Promise<void> {
  const url = 'https://example.test/protected-course.html'
  const signInShell = '<!doctype html><html><head><title>Sign in or log in</title><script>window.app = {}</script></head><body><div id="root"></div></body></html>'
  const articleMarkdown = [
    '# Course introduction',
    '',
    '## Overview',
    '',
    'This lesson explains the course workflow and preserves its readable article content.',
    '',
    '## Final section',
    '',
    'Browser-session recovery keeps this final section in the imported document.',
  ].join('\n')
  const calls: string[] = []
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown, init?: RequestInit) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    calls.push(requestUrl)
    if (requestUrl.startsWith('/__webpage_proxy?')) {
      return new Response(signInShell, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    if (requestUrl === 'http://localhost:6969/v1/sessions') {
      return new Response(JSON.stringify({ sessions: [
        { id: 'other-course-session', url, domain: 'example.test', title: 'Other account page' },
        { id: 'course-session', url, domain: 'example.test', title: 'Course introduction' },
      ] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (requestUrl === 'http://localhost:6969/v1/browser/markdown') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      if (body.session_id !== 'course-session' || body.url !== url) {
        throw new Error('Expected browser-session recovery to stay bound to the requested page')
      }
      return new Response(JSON.stringify({ title: 'Course introduction', markdown: articleMarkdown }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async () => null)
  resetWorkspaceUrlContentCacheForTests()
  try {
    const imported = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'html', browserSessionId: 'course-session' })
    if (!imported.text.includes('Browser-session recovery keeps this final section')) {
      throw new Error('Expected an authenticated page session to replace the generic sign-in shell with the page body')
    }
    if (imported.text.includes('Sign in or log in')) throw new Error('Expected the authentication shell to stay out of the imported document')
    if (!calls.includes('http://localhost:6969/v1/sessions')) {
      throw new Error('Expected non-JSON webpage imports to attempt authenticated browser-session recovery')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlExplainsRenderedPageRecoveryForAuthenticationShell(): Promise<void> {
  const url = 'https://example.test/requires-session.html'
  const signInShell = '<!doctype html><html><head><title>Log in</title></head><body><div id="app"></div></body></html>'
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    if (requestUrl.startsWith('/__webpage_proxy?')) {
      return new Response(signInShell, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async () => null)
  resetWorkspaceUrlContentCacheForTests()
  try {
    const error = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'html' }).then(
      () => null,
      value => String((value as { message?: unknown })?.message || value),
    )
    if (!error || !error.includes('Use copied page')) {
      throw new Error('Expected a generic authentication shell to explain the rendered-page import fallback')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlDetectsSavedIncompleteCapture(): Promise<void> {
  const url = 'https://example.test/saved-shell'
  const shell = `---\nkgWebpageUrl: "${url}"\nkgWebpageView: markdown\n---\n\n[Skip to content](#main)\n\n<iframe height="0" src="/frame"></iframe>\n![pixel](https://example.test/pixel)`
  const complete = `---\nkgWebpageUrl: "${url}"\nkgWebpageView: markdown\n---\n\n# Lesson\n\n${'This is substantive lesson content with enough visible text to confirm the saved page is complete. '.repeat(8)}\n\n<iframe height="0" src="/frame"></iframe>`
  if (!looksLikeIncompleteWebpageMarkdown(shell)) throw new Error('Expected hidden embeds around navigation-only text to mark a saved page as incomplete')
  if (looksLikeIncompleteWebpageMarkdown(complete)) throw new Error('Expected visible body content to keep a page with an ordinary hidden embed classified as complete')
}

export async function testWorkspaceImportUrlBypassesStalePageCacheForRefresh(): Promise<void> {
  const url = 'https://example.test/refetch-cached-page'
  const page = (title: string) => `<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1>${'<p>Visible page content for cache refresh verifies current source content is fetched. </p>'.repeat(30)}</main></body></html>`
  const fixtures = new Map([[url, page('Original cached article')]])
  const calls: string[] = []
  const restoreFetch = installWebpageProxyFetch(fixtures, calls)
  resetWorkspaceUrlContentCacheForTests()
  try {
    await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    const beforeRefetch = calls.length
    fixtures.set(url, page('New source article'))
    const refreshed = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown', bypassCache: true })
    if (!refreshed.text.includes('New source article')) throw new Error('Expected explicit source refresh to replace cached content with the current page')
    if (calls.length <= beforeRefetch) throw new Error('Expected explicit source refresh to fetch the page again')
    const reused = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!reused.text.includes('New source article')) throw new Error('Expected the refreshed page to replace the previous cached document')
  } finally {
    restoreFetch()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceHtmlFetchCacheRespectsConfiguredBudget(): Promise<void> {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return new Response('x'.repeat(256), { headers: { 'Content-Type': 'text/html' } })
  }
  const signal = new AbortController().signal
  const url = 'https://example.test/cache-budget'
  await fetchWebpageHtmlViaProxy({ url, signal, maxBytes: 512, fetchImpl })
  try {
    await fetchWebpageHtmlViaProxy({ url, signal, maxBytes: 128, fetchImpl })
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'WEBPAGE_HTML_SOURCE_LIMIT_EXCEEDED' && calls === 2) return
    throw error
  }
  throw new Error('Expected cached responses to remain isolated by their configured byte budget')
}

export async function testWorkspaceImportUrlUsesOneShotLocalClipboardCapture(): Promise<void> {
  const url = 'https://example.invalid/course/intro'
  const html = '<!doctype html><html><head><title>Course introduction</title></head><body><nav aria-label="Course index"><a href="#lesson-a">Course overview</a><a href="#lesson-b">Final lesson</a></nav><main><h1>Course introduction</h1><section id="lesson-a"><p>Lesson body first section has complete readable course content.</p></section><section id="lesson-b"><p>Lesson final marker confirms the captured page body was retained.</p></section></main></body></html>'
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  const originalFetch = globalThis.fetch
  let networkCalls = 0
  const clipboardItem = {
    types: ['text/html', 'text/plain'],
    getType: async (type: string) => new Blob([type === 'text/html' ? html : 'Copied course page'], { type }),
  }
  try {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: async () => [clipboardItem] } as unknown as Clipboard })
    globalThis.fetch = (async () => {
      networkCalls += 1
      throw new Error('Network access is forbidden during local clipboard import validation')
    }) as typeof fetch
    resetWorkspaceUrlContentCacheForTests()
    const staged = await captureWorkspacePageFromClipboard(url)
    if (staged.sourceUrl !== url || !staged.requestUrl.includes('__ag_local_page_capture_')) {
      throw new Error('Expected clipboard content to be staged against a temporary local capture marker')
    }
    const imported = await fetchWorkspaceUrlContent(staged.requestUrl, { mode: 'import', viewHint: 'markdown' })
    if (imported.normalizedUrl !== url || imported.title !== 'Course introduction') {
      throw new Error('Expected the imported page to retain its clean source URL and title')
    }
    for (const marker of ['Course overview', 'Final lesson', 'Lesson body first section', 'Lesson final marker']) {
      if (!imported.text.includes(marker)) throw new Error('Expected the captured page index and body to include: ' + marker)
    }
    if (imported.text.includes('__ag_local_page_capture_') || networkCalls !== 0) {
      throw new Error('Expected the temporary marker to stay out of the saved document and no network request to occur')
    }
    let reusedCaptureFailure: unknown
    try {
      await fetchWorkspaceUrlContent(staged.requestUrl, { mode: 'import', viewHint: 'markdown' })
    } catch (error) {
      reusedCaptureFailure = error
    }
    if (!reusedCaptureFailure) throw new Error('Expected a local clipboard capture marker to be consumable only once')
  } finally {
    globalThis.fetch = originalFetch
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    else delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlCapturesExplicitlyPastedPageContent(): Promise<void> {
  const url = 'https://example.invalid/pasted-course'
  const html = '<!doctype html><html><head><title>Pasted course</title></head><body><nav aria-label="Page index"><a href="#lesson">Lesson index entry</a></nav><main><h1>Pasted course</h1><section id="lesson"><p>Explicit paste preserves the rendered page body.</p><blockquote><p>A semantic quote stays a Markdown blockquote.</p></blockquote><p>&gt; An encoded line-leading quote marker also becomes Markdown syntax.</p><p>Inline text keeps the comparison A &gt; B.</p><pre><code>&gt; Code content remains literal.</code></pre></section></main></body></html>'
  const originalFetch = globalThis.fetch
  let networkCalls = 0
  try {
    globalThis.fetch = (async () => {
      networkCalls += 1
      throw new Error('Network access is forbidden during local pasted-page validation')
    }) as typeof fetch
    const staged = captureWorkspacePageFromContent(url, html, 'Pasted course')
    const imported = await fetchWorkspaceUrlContent(staged.requestUrl, { mode: 'import', viewHint: 'markdown' })
    for (const marker of [
      'Pasted course',
      'Lesson index entry',
      'Explicit paste preserves the rendered page body.',
      '> A semantic quote stays a Markdown blockquote.',
      '> An encoded line-leading quote marker also becomes Markdown syntax.',
      'Inline text keeps the comparison A > B.',
      '```\n> Code content remains literal.\n```',
    ]) {
      if (!imported.text.includes(marker)) throw new Error('Expected explicitly pasted HTML to preserve: ' + marker)
    }
    if (/^[\t ]*&(?:amp;)*(?:gt|#0*62|#x0*3e);/imu.test(imported.text.replace(/```[\s\S]*?```/gu, ''))) {
      throw new Error('Expected line-leading HTML quote entities to be stored as valid Markdown blockquotes')
    }
    if (imported.normalizedUrl !== url || imported.text.includes('__ag_local_page_capture_') || networkCalls !== 0) {
      throw new Error('Expected the pasted-page import to keep a clean URL and stay local')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}
