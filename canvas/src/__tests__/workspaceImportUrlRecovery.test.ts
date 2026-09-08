import { fetchWorkspaceUrlContent } from '@/features/markdown-workspace/workspaceImport'
import { isFrontmatterOnlyDoc } from '@/lib/markdown/frontmatter'
import { setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { chooseDomRecoveredMarkdown, chooseWebpageMarkdownByContentCoverage } from '@/features/markdown-workspace/workspaceImport/webpageMarkdownFidelity'
import { pruneWebpageChromeText } from '@/lib/websites/webpageShellHeuristics'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { type GlobalWithFetch, installWebpageProxyFetch } from './helpers/workspaceImportUrlFixtures'

export async function testWorkspaceImportUrlPrefersHigherCoverageMarkdownFallback(): Promise<void> {
  const converted = [
    '# Session 32',
    '',
    'A later section survived conversion, but the opening agenda and most transcripts are missing.',
  ].join('\n')
  const fallback = [
    '# Conference Day',
    '',
    'Opening agenda, venue notes, and source overview.',
    '',
    ...Array.from({ length: 180 }, (_, index) => [
      `## Session ${index + 1}`,
      '',
      `Transcript paragraph ${index + 1} preserves source-visible content across the whole page.`,
    ].join('\n')),
  ].join('\n\n')
  const selected = chooseWebpageMarkdownByContentCoverage({
    mode: 'import',
    convertedMarkdown: converted,
    fallbackMarkdown: fallback,
  })
  if (selected.source !== 'fallback') {
    throw new Error(`expected high-coverage fallback selection, got ${selected.source}`)
  }
  if (!selected.markdown.includes('Opening agenda')) {
    throw new Error('expected first source section to be preserved by fallback selection')
  }
  if (!selected.markdown.includes('Session 180')) {
    throw new Error('expected late source section to be preserved by fallback selection')
  }
}

export async function testWorkspaceImportUrlDomChooserIgnoresShellChromeDuringCoverage(): Promise<void> {
  const convertedMarkdown = [
    '# Analyze recent oil market reports from major institutions like Goldman Sachs and UBS.',
    '',
    '## Summary',
    '',
    '1. Shared logical blind spot in recent Goldman Sachs and UBS oil reports.',
    '2. Shipping risk, inventory lag, and policy feedbacks raise the price floor.',
  ].join('\n')
  const renderedTextMarkdown = [
    'MiroMind App is now available - access MiroMind wherever you are.',
    'Get App',
    'Sign In',
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS.',
    'Summary',
    'Shared logical blind spot in recent Goldman Sachs and UBS oil reports.',
    'Shipping risk, inventory lag, and policy feedbacks raise the price floor.',
    'We use cookies',
    "What's New",
    'Release notes and changelog',
  ].join('\n')
  const selected = chooseDomRecoveredMarkdown({
    mode: 'import',
    convertedMarkdown,
    renderedTextMarkdown,
  })
  if (selected.source !== 'converted') {
    throw new Error(`expected shell-pruned DOM chooser to preserve structured markdown, got ${selected.source}`)
  }
  if (selected.renderedCoverageRatio < 0.72) {
    throw new Error(`expected shell-pruned rendered coverage to stay high, got ${selected.renderedCoverageRatio}`)
  }
}

export async function testWorkspaceImportUrlChromePruningDoesNotTruncateSubstantiveAboutLines(): Promise<void> {
  const pruned = pruneWebpageChromeText([
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS.',
    'Summary',
    'What Goldman Sachs is assuming',
    '',
    'Goldman has raised its 2026 Brent average to about $85/bbl from $77 after the disruption.',
    'Core assumptions:',
    'Hormuz flows are severely disrupted for several weeks before gradual normalization.',
    'High near-term prices give way to a lower plateau in the original bank scenario.',
    'Demand adjusts in a smooth, price-responsive way in that baseline.',
    'What UBS is assuming',
    'UBS projects 2026 global oil demand growth of ~1.2 mbpd.',
    "What's New",
    'Release notes and changelog',
  ].join('\n'))
  if (!pruned.includes('about $85/bbl from $77')) {
    throw new Error(`expected substantive lines containing "about" to survive chrome pruning, got:\n${pruned}`)
  }
  if (pruned.includes("What's New") || pruned.includes('Release notes and changelog')) {
    throw new Error(`expected low-value tail sections to be pruned, got:\n${pruned}`)
  }
}

export async function testWorkspaceImportUrlDomChooserRepairsMergedLeadingBoundariesFromRenderedText(): Promise<void> {
  const convertedMarkdown = [
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS. Identify a shared logical blind spot. Based on this flaw, re-simulate the global oil price trajectory for the next six months.Show thinking trajectory Summary',
    '',
    '## 1. Shared logical blind spot in recent Goldman Sachs & UBS oil reports',
  ].join('\n')
  const renderedTextMarkdown = [
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS. Identify a shared logical blind spot. Based on this flaw, re-simulate the global oil price trajectory for the next six months.',
    'Show thinking trajectory',
    'Summary',
    '1. Shared logical blind spot in recent Goldman Sachs & UBS oil reports',
  ].join('\n')
  const selected = chooseDomRecoveredMarkdown({
    mode: 'import',
    convertedMarkdown,
    renderedTextMarkdown,
  })
  if (!selected.markdown.includes('next six months.\n\nShow thinking trajectory\n\nSummary')) {
    throw new Error(`expected chooser to repair merged leading boundaries, got:\n${selected.markdown}`)
  }
}

export async function testWorkspaceImportUrlImportPreservesFullTextFallbackBody(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://example.com/conference'
  const first = 'Opening agenda source-visible content'
  const last = 'Closing transcript source-visible content'
  const manyScripts = Array.from({ length: 25 }, () => '<script>var shell=1;</script>').join('')
  const paragraphs = [
    `<p>${first}</p>`,
    ...Array.from({ length: 160 }, (_, index) => `<p>Transcript segment ${index + 1} remains part of the imported source text.</p>`),
    `<p>${last}</p>`,
  ].join('')
  const calls: string[] = []
  const restore = installWebpageProxyFetch(
    new Map([[url, `<!doctype html><html><head><title>Conference</title>${manyScripts}</head><body><main><h1>Conference</h1>${paragraphs}</main></body></html>`]]),
    calls,
  )
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res || typeof res.text !== 'string') throw new Error('expected import result')
    if (!res.text.includes(first)) throw new Error('expected first source-visible paragraph')
    if (!res.text.includes(last)) throw new Error('expected last source-visible paragraph')
    if (res.text.includes('…(clipped')) throw new Error('expected import fallback body to avoid refresh clipping')
    if (!calls.some(call => call.startsWith('/__webpage_proxy?'))) throw new Error('expected shared webpage proxy ingestion')
    if (calls.some(call => call.startsWith('/__fetch_remote?'))) throw new Error('unexpected legacy fetch endpoint')
  } finally {
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlImportRecoversJsRenderedContentViaDomExportFallback(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://example.com/shared-report'
  const shellHtml = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<title>Shared Report</title>',
    ...Array.from({ length: 24 }, (_, index) => `<script>window.__shell_${index}=true;</script>`),
    '</head>',
    '<body>',
    '<section class="banner">Get App</section>',
    '<section id="__next">Loading shared report...</section>',
    '</body>',
    '</html>',
  ].join('')
  const recoveredTitle = 'Shared Oil Report'
  const recoveredParagraphs = Array.from({ length: 8 }, (_, index) =>
    `Supporting section ${index + 1} expands the report with source-visible details about price floors, shipping risk, inventory lag, and transition feedback loops.`,
  )
  const recoveredText = [
    recoveredTitle,
    '',
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS.',
    '',
    'Identify a shared logical blind spot and re-simulate the next six-month trajectory.',
    '',
    ...recoveredParagraphs,
  ].join('\n')
  const recoveredHtml = [
    '<!doctype html>',
    '<html>',
    '<head>',
    `<title>${recoveredTitle}</title>`,
    '</head>',
    '<body>',
    `<main><h1>${recoveredTitle}</h1><p>Analyze recent oil market reports from major institutions like Goldman Sachs and UBS.</p><p>Identify a shared logical blind spot and re-simulate the next six-month trajectory.</p>${recoveredParagraphs.map(paragraph => `<p>${paragraph}</p>`).join('')}</main>`,
    '</body>',
    '</html>',
  ].join('')
  const proxyCalls: string[] = []
  const domModes: string[] = []
  const restore = installWebpageProxyFetch(new Map([[url, shellHtml]]), proxyCalls)
  setWorkspaceWebpageDomExportForTests(async args => {
    domModes.push(String(args.mode || ''))
    if (args.mode === 'html') {
      return { text: recoveredHtml, title: recoveredTitle, clipped: false }
    }
    return { text: recoveredText, title: recoveredTitle, clipped: false }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import' })
    if (isFrontmatterOnlyDoc(res.text)) {
      throw new Error('expected import fallback to recover non-empty DOM-rendered content')
    }
    if (!res.text.includes('Goldman Sachs and UBS')) {
      throw new Error('expected import fallback to preserve the DOM-rendered report body')
    }
    if (!res.text.includes('logical blind spot')) {
      throw new Error('expected import fallback to preserve later DOM-rendered report sections')
    }
    if (res.text.includes('Loading shared report')) {
      throw new Error('expected DOM export fallback to replace raw app-shell placeholder text')
    }
    if (!proxyCalls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('expected shared webpage proxy fetch before DOM export fallback')
    }
    if (!domModes.includes('html')) {
      throw new Error(`expected DOM export fallback to probe the hydrated html mode, got ${JSON.stringify(domModes)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlImportRecoversLongLoadingShellViaDomExportFallback(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://example.com/shared-conversation'
  const shellLinks = Array.from(
    { length: 60 },
    (_, index) => `<a href="/shortcut-${index + 1}">Open App Shortcut ${index + 1}</a>`,
  ).join('')
  const shellHtml = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<title>Shared Conversation</title>',
    '</head>',
    '<body>',
    '<header><a href="/app">Get App</a><a href="/sign-in">Sign in</a><a href="/install">Install App</a></header>',
    '<main>',
    '<h1>Shared Conversation</h1>',
    '<p>Loading shared chat...</p>',
    `<nav>${shellLinks}</nav>`,
    '</main>',
    '</body>',
    '</html>',
  ].join('')
  const recoveredText = [
    'Shared Conversation Analysis',
    '',
    'This imported body preserves the substantive discussion after the live share finishes hydrating.',
    '',
    'It includes the longer paragraphs that should replace the loading shell and shortcut chrome.',
    '',
    ...Array.from({ length: 6 }, (_, index) => `Detailed section ${index + 1} captures the underlying report body with concrete evidence and reasoning.`),
  ].join('\n')
  const recoveredHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Shared Conversation Analysis</title></head>',
    '<body>',
    '<main>',
    '<h1>Shared Conversation Analysis</h1>',
    '<p>This imported body preserves the substantive discussion after the live share finishes hydrating.</p>',
    '<p>It includes the longer paragraphs that should replace the loading shell and shortcut chrome.</p>',
    ...Array.from({ length: 6 }, (_, index) => `<p>Detailed section ${index + 1} captures the underlying report body with concrete evidence and reasoning.</p>`),
    '</main>',
    '</body>',
    '</html>',
  ].join('')
  const proxyCalls: string[] = []
  const domModes: string[] = []
  const restore = installWebpageProxyFetch(new Map([[url, shellHtml]]), proxyCalls)
  setWorkspaceWebpageDomExportForTests(async args => {
    domModes.push(String(args.mode || ''))
    if (args.mode === 'html') return { text: recoveredHtml, title: 'Shared Conversation Analysis', clipped: false }
    return { text: recoveredText, title: 'Shared Conversation Analysis', clipped: false }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import' })
    if (!res.text.includes('substantive discussion after the live share finishes hydrating')) {
      throw new Error('expected long loading-shell imports to recover the hydrated report body')
    }
    if (res.text.includes('Loading shared chat')) {
      throw new Error('expected long loading-shell imports to replace the loading placeholder text')
    }
    if (!proxyCalls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('expected long loading-shell import to probe the shared webpage proxy first')
    }
    if (!domModes.includes('html')) {
      throw new Error(`expected long loading-shell fallback to probe the hydrated html mode, got ${JSON.stringify(domModes)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlImportRecoversProxyFetchFailureViaDomExportFallback(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const proxyCalls: string[] = []
  const domModes: string[] = []
  const htmlPreferScriptDisabledFlags: boolean[] = []
  const substantiveParagraphs = Array.from({ length: 6 }, (_, index) =>
    `Detailed section ${index + 1} preserves the Claude-visible reasoning about recovery asymmetry, refinery lag, inventory draw timing, sanctions elasticity, and how forward curves can anchor analysts to the wrong base case.`,
  )
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    proxyCalls.push(requestUrl)
    if (requestUrl.startsWith('/__webpage_proxy?')) {
      throw new Error('Timeout')
    }
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async args => {
    domModes.push(String(args.mode || ''))
    if (args.mode === 'html') htmlPreferScriptDisabledFlags.push(args.preferScriptDisabled === true)
    if (args.mode === 'html') {
      return {
        text: [
          '<!doctype html>',
          '<html>',
          '<head><title>Claude Chat Export</title></head>',
          '<body>',
          '<main>',
          '<h1>Oil market blind spot analysis and price forecast</h1>',
          '<h2>The shared blind spot: symmetric recovery fallacy + resolution anchoring</h2>',
          '<p>The deepest flaw is not being wrong about prices.</p>',
          ...substantiveParagraphs.map(paragraph => `<p>${paragraph}</p>`),
          '</main>',
          '</body>',
          '</html>',
        ].join(''),
        title: 'Claude Chat Export',
        clipped: false,
      }
    }
    return {
      text: [
        'Oil market blind spot analysis and price forecast',
        '',
        'The shared blind spot: symmetric recovery fallacy + resolution anchoring',
        '',
        'The deepest flaw is not being wrong about prices.',
        '',
        ...substantiveParagraphs,
      ].join('\n'),
      title: 'Claude Chat Export',
      clipped: false,
    }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected proxy fetch failure import to recover the Claude body through DOM export, got:\n${res.text}`)
    }
    if (res.text.includes(`[](${url})`)) {
      throw new Error('expected proxy fetch failure recovery to avoid falling back to a synthetic source-link stub')
    }
    if (!proxyCalls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('expected proxy fetch failure recovery to attempt the shared webpage proxy first')
    }
    if (!domModes.includes('html')) {
      throw new Error(`expected proxy fetch failure recovery to escalate into DOM export html mode, got ${JSON.stringify(domModes)}`)
    }
    if (!htmlPreferScriptDisabledFlags.includes(true)) {
      throw new Error(`expected proxy fetch failure recovery to prefer script-disabled html export, got ${JSON.stringify(htmlPreferScriptDisabledFlags)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlImportDoesNotReuseCachedConnectionShellMarkdown(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  let currentHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Claude</title></head>',
    '<body>',
    '<main>',
    '<h1>Can&apos;t reach Claude</h1>',
    '<p>Check your connection.</p>',
    '<button>Try again</button>',
    '</main>',
    '</body>',
    '</html>',
  ].join('')
  const proxyCalls: string[] = []
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    proxyCalls.push(requestUrl)
    if (!requestUrl.startsWith('/__webpage_proxy?')) {
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }
    return new Response(currentHtml, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async () => null)
  try {
    const rejectedConnectionShell = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' }).then(() => false, e => String((e as { message?: unknown })?.message || e).includes('Authenticated browser session required'))
    if (!rejectedConnectionShell) throw new Error('expected first import fetch to reject the low-fidelity connection shell before persistence')
    currentHtml = [
      '<!doctype html>',
      '<html>',
      '<head><title>Claude Chat Export</title></head>',
      '<body>',
      '<main>',
      '<h1>Oil market blind spot analysis and price forecast</h1>',
      '<p>The shared blind spot is a symmetric recovery assumption applied to an asymmetric supply chain.</p>',
      '<p>Fresh proxy content should replace any previously cached connection shell for the same URL.</p>',
      '</main>',
      '</body>',
      '</html>',
    ].join('')
    const second = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!second.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected second import fetch to bypass stale cached shell content, got:\n${second.text}`)
    }
    if (second.text.includes("Can't reach Claude") || second.text.includes('Check your connection.')) {
      throw new Error(`expected second import fetch to discard stale cached connection shell content, got:\n${second.text}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlImportUsesApiNativeBrowserSessionMarkdownWhenProxyAndDomStayLowFidelity(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const fetchCalls: string[] = []
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown, init?: RequestInit) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    fetchCalls.push(requestUrl)
    if (requestUrl.startsWith('/__webpage_proxy?')) {
      return new Response([
        '<!doctype html>',
        '<html>',
        '<head><title>Claude</title></head>',
        '<body>',
        '<main>',
        '<h1>Can&apos;t reach Claude</h1>',
        '<p>Check your connection.</p>',
        '<button>Try again</button>',
        '</main>',
        '</body>',
        '</html>',
      ].join(''), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    if (requestUrl === 'http://localhost:6969/v1/sessions') {
      return new Response(JSON.stringify({
        sessions: [
          {
            id: 'claude-session-1',
            url,
            domain: 'claude.ai',
            title: 'Oil market blind spot analysis and price forecast - Claude',
          },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (requestUrl === 'http://localhost:6969/v1/browser/markdown') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      if (body.session_id !== 'claude-session-1' || body.url !== url) {
        throw new Error(`expected browser markdown fallback to target the matching claude session, got ${JSON.stringify(body)}`)
      }
      return new Response(JSON.stringify({
        markdown: [
          '# Oil market blind spot analysis and price forecast',
          '',
          '## The shared blind spot: symmetric recovery fallacy + resolution anchoring',
          '',
          'Every major institution shares the same structural flaw wired into its model.',
          '',
          'The re-simulated trajectory shows why the symmetric recovery assumption breaks once supply chokepoints and demand destruction interact.',
        ].join('\n'),
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
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected browser-session markdown fallback to recover the Claude body, got:\n${res.text}`)
    }
    if (res.text.includes("Can't reach Claude") || res.text.includes('Check your connection.')) {
      throw new Error(`expected browser-session markdown fallback to replace the Claude connection shell, got:\n${res.text}`)
    }
    if (res.title !== 'Oil market blind spot analysis and price forecast - Claude') throw new Error(`expected browser-session title to survive import content recovery, got ${JSON.stringify(res.title)}`)
    if (!fetchCalls.includes('http://localhost:6969/v1/sessions')) {
      throw new Error(`expected browser-session markdown fallback to enumerate local sessions, got ${JSON.stringify(fetchCalls)}`)
    }
    if (!fetchCalls.includes('http://localhost:6969/v1/browser/markdown')) {
      throw new Error(`expected browser-session markdown fallback to request markdown from the local browser runtime, got ${JSON.stringify(fetchCalls)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}
