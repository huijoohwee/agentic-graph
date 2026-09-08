import { fetchWorkspaceUrlContent } from '@/features/markdown-workspace/workspaceImport'
import { setWorkspaceWebpageDomExportForTests } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { plainTextToMarkdown } from '@/lib/markdown/plainTextToMarkdown'
import { restoreWebpageMarkdownSyntaxFidelity } from '@/lib/markdown/webpageMarkdownSyntaxFidelity'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { type GlobalWithFetch, installWebpageProxyFetch } from './helpers/workspaceImportUrlFixtures'

export async function testWorkspaceImportUrlImportPrefersScriptDisabledTextProbeWhenHtmlRecoveryIsInsufficient(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const textPreferScriptDisabledFlags: boolean[] = []
  const substantiveParagraphs = Array.from({ length: 6 }, (_, index) =>
    `Detailed section ${index + 1} preserves the Claude-visible reasoning about refinery lag, sanctions elasticity, forward-curve anchoring, and inventory draw timing.`,
  )
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    if (requestUrl.startsWith('/__webpage_proxy?')) throw new Error('Timeout')
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode === 'text') textPreferScriptDisabledFlags.push(args.preferScriptDisabled === true)
    if (args.mode === 'html') {
      return {
        text: [
          '<!doctype html>',
          '<html>',
          '<head><title>Claude Chat Export</title></head>',
          '<body>',
          '<main><h1>Claude Chat Export</h1></main>',
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
      throw new Error(`expected text DOM recovery to preserve the Claude body when html recovery is insufficient, got:\n${res.text}`)
    }
    if (!textPreferScriptDisabledFlags.includes(true)) {
      throw new Error(`expected text DOM recovery to prefer script-disabled export, got ${JSON.stringify(textPreferScriptDisabledFlags)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlImportRetriesScriptEnabledHtmlProbeWhenScriptDisabledHtmlIsHydrationShell(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const htmlPreferScriptDisabledFlags: boolean[] = []
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    if (requestUrl.startsWith('/__webpage_proxy?')) throw new Error('Timeout')
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode === 'text') {
      throw new Error('expected script-enabled html retry to satisfy recovery before the text probe')
    }
    htmlPreferScriptDisabledFlags.push(args.preferScriptDisabled === true)
    if (args.preferScriptDisabled) {
      return {
        text: [
          '<!doctype html>',
          '<html>',
          '<head><title>Claude Chat Export</title></head>',
          '<body><section id="root"></section></body>',
          '</html>',
        ].join(''),
        title: 'Claude Chat Export',
        clipped: false,
      }
    }
    return {
      text: [
        '<!doctype html>',
        '<html>',
        '<head><title>Claude Chat Export</title></head>',
        '<body>',
        '<main>',
        '<h1>Oil market blind spot analysis and price forecast</h1>',
        '<p>The shared blind spot is a symmetric recovery assumption applied to an asymmetric supply chain.</p>',
        '<p>Rendered script-enabled fallback preserves the Claude-visible body when the stripped page is only a hydration shell.</p>',
        '</main>',
        '</body>',
        '</html>',
      ].join(''),
      title: 'Claude Chat Export',
      clipped: false,
    }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected script-enabled html retry to recover rendered body content, got:\n${res.text}`)
    }
    if (htmlPreferScriptDisabledFlags.length < 2 || htmlPreferScriptDisabledFlags[0] !== true || !htmlPreferScriptDisabledFlags.includes(false)) {
      throw new Error(`expected html DOM recovery to retry without script-disabled mode after a hydration shell, got ${JSON.stringify(htmlPreferScriptDisabledFlags)}`)
    }
    if (res.text.includes(`[](${url})`)) {
      throw new Error('expected html retry recovery to avoid falling back to a synthetic source-link stub')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlImportRetriesScriptEnabledHtmlProbeWhenScriptDisabledHtmlIsConnectionShell(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const htmlPreferScriptDisabledFlags: boolean[] = []
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    if (requestUrl.startsWith('/__webpage_proxy?')) throw new Error('Timeout')
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode === 'text') {
      throw new Error('expected script-enabled html retry to recover the Claude body before the text probe')
    }
    htmlPreferScriptDisabledFlags.push(args.preferScriptDisabled === true)
    if (args.preferScriptDisabled) {
      return {
        text: [
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
        ].join(''),
        title: 'Claude',
        clipped: false,
      }
    }
    return {
      text: [
        '<!doctype html>',
        '<html>',
        '<head><title>Claude Chat Export</title></head>',
        '<body>',
        '<main>',
        '<h1>Oil market blind spot analysis and price forecast</h1>',
        '<p>The shared blind spot is a symmetric recovery assumption applied to an asymmetric supply chain.</p>',
        '<p>Rendered script-enabled fallback preserves the Claude-visible body when the stripped page only shows the short connection error shell.</p>',
        '</main>',
        '</body>',
        '</html>',
      ].join(''),
      title: 'Claude Chat Export',
      clipped: false,
    }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected script-enabled html retry to recover rendered body content after a connection shell, got:\n${res.text}`)
    }
    if (res.text.includes("Can't reach Claude") || res.text.includes('Check your connection.')) {
      throw new Error(`expected connection shell recovery to exclude Claude error chrome, got:\n${res.text}`)
    }
    if (htmlPreferScriptDisabledFlags.length < 2 || htmlPreferScriptDisabledFlags[0] !== true || !htmlPreferScriptDisabledFlags.includes(false)) {
      throw new Error(`expected html DOM recovery to retry without script-disabled mode after a connection shell, got ${JSON.stringify(htmlPreferScriptDisabledFlags)}`)
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlImportPrefersStructuredDomMarkdownWhenItPreservesRenderedContent(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://example.com/rendered-share'
  const shellLinks = Array.from(
    { length: 60 },
    (_, index) => `<a href="/shortcut-${index + 1}">Open App Shortcut ${index + 1}</a>`,
  ).join('')
  const shellHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Rendered Share</title></head>',
    '<body>',
    '<header><a href="/app">Get App</a><a href="/sign-in">Sign in</a><a href="/install">Install App</a></header>',
    '<main><h1>Rendered Share</h1><p>Loading shared chat...</p><nav>',
    shellLinks,
    '</nav></main>',
    '</body>',
    '</html>',
  ].join('')
  const renderedText = [
    'Analyze recent oil market reports from major institutions like Goldman Sachs and UBS. Identify a shared logical blind spot. Based on this flaw, re-simulate the global oil price trajectory for the next six months.',
    'Show thinking trajectory',
    '',
    'Summary',
    '',
    'Shared logical blind spot in recent Goldman Sachs and UBS oil reports.',
  ].join('\n')
  const recoveredHtml = [
    '<!doctype html>',
    '<html>',
    '<head><title>Rendered Share</title></head>',
    '<body>',
    '<main>',
    '<h1>Analyze recent oil market reports from major institutions like Goldman Sachs and UBS. Identify a shared logical blind spot. Based on this flaw, re-simulate the global oil price trajectory for the next six months.</h1>',
    '<h2>Show thinking trajectory</h2>',
    '<h3>Summary</h3>',
    '<ol><li>Shared logical blind spot in recent Goldman Sachs and UBS oil reports.</li></ol>',
    '</main>',
    '</body>',
    '</html>',
  ].join('')
  const proxyCalls: string[] = []
  const restore = installWebpageProxyFetch(new Map([[url, shellHtml]]), proxyCalls)
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode === 'html') return { text: recoveredHtml, title: 'Rendered Share', clipped: false }
    return { text: renderedText, title: 'Rendered Share', clipped: false }
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('# Analyze recent oil market reports from major institutions like Goldman Sachs and UBS. Identify a shared logical blind spot. Based on this flaw, re-simulate the global oil price trajectory for the next six months.')) {
      throw new Error(`expected import DOM recovery to prefer structured markdown heading output, got:\n${res.text}`)
    }
    if (!res.text.includes('## Show thinking trajectory') || !res.text.includes('### Summary')) {
      throw new Error(`expected import DOM recovery to preserve rendered text as markdown headings, got:\n${res.text}`)
    }
    if (!res.text.includes('1. Shared logical blind spot in recent Goldman Sachs and UBS oil reports.')) {
      throw new Error(`expected import DOM recovery to preserve rendered list content, got:\n${res.text}`)
    }
    if (res.text.includes(`[](${url})`)) {
      throw new Error('expected DOM recovery to avoid injecting a synthetic source-link line into the body')
    }
    if (res.text.includes('months.Show thinking trajectory') || res.text.includes('trajectory Summary')) {
      throw new Error('expected import DOM recovery to avoid reconstructed HTML text merges when structured DOM markdown is available')
    }
    if (!proxyCalls.some(call => call.startsWith('/__webpage_proxy?'))) {
      throw new Error('expected structured DOM recovery test to exercise the shared webpage proxy path')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportUrlImportSkipsTextDomProbeWhenStructuredHtmlRecoveryIsAlreadySufficient(): Promise<void> {
  resetWorkspaceUrlContentCacheForTests()
  const url = 'https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7'
  const substantiveParagraphs = Array.from({ length: 6 }, (_, index) =>
    `Detailed section ${index + 1} preserves the Claude-visible reasoning about recovery asymmetry, refinery lag, inventory draw timing, sanctions elasticity, and how forward curves can anchor analysts to the wrong base case.`,
  )
  const g = globalThis as GlobalWithFetch
  const previousFetch = g.fetch
  g.fetch = (async (input: unknown) => {
    const requestUrl = input instanceof URL ? input.toString() : String(input || '')
    if (requestUrl.startsWith('/__webpage_proxy?')) throw new Error('Timeout')
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }) as unknown as typeof fetch
  setWorkspaceWebpageDomExportForTests(async args => {
    if (args.mode === 'text') {
      throw new Error('expected structured html recovery to skip the secondary text DOM probe')
    }
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
  })
  try {
    const res = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    if (!res.text.includes('Oil market blind spot analysis and price forecast')) {
      throw new Error(`expected structured html recovery to succeed without the text DOM probe, got:\n${res.text}`)
    }
    if (res.text.includes(`[](${url})`)) {
      throw new Error('expected structured html recovery to avoid falling back to a synthetic source-link stub')
    }
  } finally {
    setWorkspaceWebpageDomExportForTests(null)
    g.fetch = previousFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testPlainTextToMarkdownPreservesThinkingTranscriptMarkdownStructure(): Promise<void> {
  const markdown = restoreWebpageMarkdownSyntaxFidelity(plainTextToMarkdown([
    '- The user wants me to: 1. Analyze recent oil market reports 2. Identify a shared logical blind spot 3. Re-simulate the global oil price trajectory for the next six months',
    'Goldman Sachs: - Focuses on Strait of Hormuz disruption - Assumes supply disruptions are temporary',
    'Shared blind spot: 1. It is circular reasoning 2. It ignores transition feedback loops',
    '> Existing quote stays quoted.',
    '[Reuters](https://www.reuters.com/example)',
    '![oil chart](https://example.com/oil-chart.png)',
    '| Institution | Price |',
    '| Goldman | $85/bbl |',
    '```python',
    'print("Brent", 85)',
    '  ```',
    '    ````',
    'raw',
    '  ````',
    'Inline math $x+y$ stays visible.',
  ].join('\n')))
  if (!markdown.includes('- The user wants me to:\n1. Analyze recent oil market reports\n2. Identify a shared logical blind spot\n3. Re-simulate the global oil price trajectory for the next six months')) {
    throw new Error(`expected transcript prose plus ordered markers to expand into markdown list lines, got:\n${markdown}`)
  }
  if (!markdown.includes('Goldman Sachs:\n- Focuses on Strait of Hormuz disruption\n- Assumes supply disruptions are temporary')) {
    throw new Error(`expected inline bullet markers to expand into markdown bullet lines, got:\n${markdown}`)
  }
  if (!markdown.includes('Shared blind spot:\n1. It is circular reasoning\n2. It ignores transition feedback loops')) {
    throw new Error(`expected inline ordered markers to expand into markdown ordered lines, got:\n${markdown}`)
  }
  if (!markdown.includes('> Existing quote stays quoted.')) throw new Error(`expected blockquote marker to be preserved, got:\n${markdown}`)
  if (!markdown.includes('[Reuters](https://www.reuters.com/example)')) throw new Error(`expected markdown link to be preserved, got:\n${markdown}`)
  if (!markdown.includes('![oil chart](https://example.com/oil-chart.png)')) throw new Error(`expected markdown image to be preserved, got:\n${markdown}`)
  if (!markdown.includes('| Institution | Price |') || !markdown.includes('| Goldman | $85/bbl |')) {
    throw new Error(`expected markdown table lines to be preserved, got:\n${markdown}`)
  }
  if (!markdown.includes('```python\nprint("Brent", 85)\n```')) {
    throw new Error(`expected fenced code block to be preserved, got:\n${markdown}`)
  }
  if (!markdown.includes('````\nraw\n````')) {
    throw new Error(`expected plain-text markdown conversion to normalize indented fence delimiters, got:\n${markdown}`)
  }
  if (!markdown.includes('Inline math $x+y$ stays visible.')) throw new Error(`expected inline math markers to be preserved, got:\n${markdown}`)
}

export async function testPlainTextToMarkdownSplitsThinkingNarrativeTailsFromInlineListLines(): Promise<void> {
  const markdown = restoreWebpageMarkdownSyntaxFidelity(plainTextToMarkdown([
    '1. Analyze recent oil market reports 2. Identify a shared logical blind spot 3. Re-simulate the global oil price trajectory for the next six months First, I need to search for recent oil market reports.',
    '- Baseline scenario assumes 21 days low flows then recovery UBS:',
    '- Focuses on supply-demand balance',
  ].join('\n')))
  if (!markdown.includes('3. Re-simulate the global oil price trajectory for the next six months\nFirst, I need to search for recent oil market reports.')) {
    throw new Error(`expected trailing transcript narrative to split away from the final ordered-list item, got:\n${markdown}`)
  }
  if (!markdown.includes('- Baseline scenario assumes 21 days low flows then recovery\nUBS:\n- Focuses on supply-demand balance')) {
    throw new Error(`expected inline section labels after bullet items to split into standalone lines, got:\n${markdown}`)
  }
}

export async function testWorkspaceImportUrlRestoresVisibleMarkdownSyntaxTokens(): Promise<void> {
  const restored = restoreWebpageMarkdownSyntaxFidelity([
    '\\> quoted line',
    '\\- bullet line',
    '\\[1]\\[2] citation refs',
    'approx. \\~$85/bbl and \\$x+y\\$',
    '| left \\| right | value \\| more |',
    'inline \\`code\\` and \\*emphasis\\*',
    '- The user wants me to: 1. Analyze reports 2. Identify a blind spot 3. Re-simulate prices',
    'Goldman Sachs: - Focuses on supply shocks - Assumes demand stays resilient',
    '<section class="flex items-center gap-2"><section></section><section><span class="text-p text-secondary">Found 9 results</span></section></section>',
    '- <section class="flex items-center gap-2"><section></section><section><span class="text-p text-secondary">Run Code</span></section></section>',
    '```python',
    '- import numpy as np',
    'print("ok")',
    '  ```',
    '    ````',
    'value',
    '  ````',
  ].join('\n'))

  if (!restored.includes('> quoted line')) throw new Error(`expected blockquote marker to be restored, got:\n${restored}`)
  if (!restored.includes('- bullet line')) throw new Error(`expected bullet marker to be restored, got:\n${restored}`)
  if (!restored.includes('[1][2] citation refs')) throw new Error(`expected citation brackets to be restored, got:\n${restored}`)
  if (!restored.includes('approx. ~$85/bbl and $x+y$')) throw new Error(`expected tilde and dollar tokens to be restored, got:\n${restored}`)
  if (!restored.includes('| left | right | value | more |')) throw new Error(`expected table pipes to be restored, got:\n${restored}`)
  if (!restored.includes('inline `code` and *emphasis*')) throw new Error(`expected inline markdown tokens to be restored, got:\n${restored}`)
  if (!restored.includes('- The user wants me to:\n1. Analyze reports\n2. Identify a blind spot\n3. Re-simulate prices')) {
    throw new Error(`expected inline ordered transcript markers to expand into markdown list lines, got:\n${restored}`)
  }
  if (!restored.includes('Goldman Sachs:\n- Focuses on supply shocks\n- Assumes demand stays resilient')) {
    throw new Error(`expected inline bullet transcript markers to expand into markdown bullet lines, got:\n${restored}`)
  }
  if (!restored.includes('Found 9 results') || restored.includes('<section class=')) {
    throw new Error(`expected generic html wrappers to collapse to visible text, got:\n${restored}`)
  }
  if (!restored.includes('- Run Code')) throw new Error(`expected list-prefixed html wrappers to preserve the list marker, got:\n${restored}`)
  if (!restored.includes('```python\nimport numpy as np\nprint("ok")\n```')) {
    throw new Error(`expected recovered fenced code blocks to keep code lines instead of list markers, got:\n${restored}`)
  }
  if (!restored.includes('````\nvalue\n````')) {
    throw new Error(`expected indented fence delimiters to be normalized without indent, got:\n${restored}`)
  }
}
