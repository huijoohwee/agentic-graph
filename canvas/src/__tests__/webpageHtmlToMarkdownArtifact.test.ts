import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { convertWebpageHtmlToMarkdownArtifact, convertWebpageHtmlToMarkdownArtifactAsync } from '@/lib/websites/webpageHtmlToMarkdownArtifact'

export async function testWebpageHtmlToMarkdownArtifactExtractsNavMenusAndTables() {
  const { restore } = initJsdomHarness()
  try {
    const html = [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<meta name="generator" content="WordPress 6.5" />',
      '<title>AIAP Field Guide - AIAP</title>',
      '</head>',
      '<body>',
      '<a class="skip-link" href="#main">Skip to content</a>',
      '<header>',
      '  <a href="/"><img alt="AIAP" src="/logo.png" /></a>',
      '  <nav>',
      '    <ul>',
      '      <li>',
      '        <a href="/programmes">OUR PROGRAMMES</a>',
      '        <ul>',
      '          <li><a href="/apprenticeship/">AI Apprenticeship Programme®</a></li>',
      '          <li><a href="/industry/">AIAP For Industry</a></li>',
      '        </ul>',
      '      </li>',
      '      <li><a href="/about">About AISG</a></li>',
      '    </ul>',
      '  </nav>',
      '  <button aria-label="Toggle Menu"></button>',
      '</header>',
      '<main id="main">',
      '  <h1>The AIAP Field Guide (Version 4.0)</h1>',
      '  <p><em>A 12 months self-directed AI/ML learning journey</em>.</p>',
      '  <h2>Contributors</h2>',
      '  <table>',
      '    <tr><th>Team</th><th>Contributors</th></tr>',
      '    <tr><td>AIAP Team</td><td>Laurence Liew, Kevin Chng</td></tr>',
      '  </table>',
      '</main>',
      '<footer><a href="/privacy">Privacy</a></footer>',
      '</body>',
      '</html>',
    ].join('')

    const md = convertWebpageHtmlToMarkdownArtifact({ html, url: 'https://aiap.sg/aiap-field-guide/' })
    if (!md.includes('# AIAP Field Guide - AIAP')) throw new Error('expected page title')
    if (!md.includes('## 📋 TABLE OF CONTENTS')) throw new Error('expected TOC')
    if (!md.includes('## ♿ ACCESSIBILITY FEATURES')) throw new Error('expected accessibility section')
    if (!md.includes('Skip to content')) throw new Error('expected skip link')
    if (!md.includes('## 🧭 NAVIGATION HEADER')) throw new Error('expected navigation header')
    if (!md.includes('OUR PROGRAMMES')) throw new Error('expected nav label')
    if (!md.includes('AI Apprenticeship Programme®')) throw new Error('expected dropdown item')
    if (!md.includes('https://aiap.sg/logo.png')) throw new Error('expected resolved logo url')
    if (!md.includes('┌') || !md.includes('┐')) throw new Error('expected box-drawing')
    if (!md.includes('| Team | Contributors |')) throw new Error('expected markdown table from HTML table')
    if (!md.includes('## 🗂️ ASSET CATALOG')) throw new Error('expected asset catalog')
  } finally {
    restore()
  }
}

export async function testWebpageHtmlToMarkdownArtifactSupportsMenuDivAndOgImageWithoutNoisyScripts() {
  const { restore } = initJsdomHarness()
  try {
    const html = [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<title>Example Landing</title>',
      '<meta property="og:image" content="/hero.png" />',
      '</head>',
      '<body>',
      '<section id="top-menu" data-menu="yes" aria-label="Navigation menu">',
      '  <img alt="Company" src="/logo.svg" />',
      '  <a href="#about">ABOUT</a>',
      '  <a href="#faq">FAQ</a>',
      '</section>',
      '<section id="content">',
      '  <section id="about">',
      '    <section>What is the programme?</section>',
      '    <section>This programme connects innovators with organisations to pilot solutions.</section>',
      '    <style>#rec123 .t396{height:70px;}</style>',
      '    <script>var injected = true; console.log(injected)</script>',
      '  </section>',
      '</section>',
      '<section id="footer" class="footer"><a href="/privacy">Privacy</a></section>',
      '</body>',
      '</html>',
    ].join('')

    const md = convertWebpageHtmlToMarkdownArtifact({ html, url: 'https://example.com/' })
    if (!md.includes('## 🧭 NAVIGATION HEADER')) throw new Error('expected navigation header')
    if (!md.includes('[ABOUT]') || !md.includes('[FAQ]')) throw new Error('expected menu labels')
    if (!md.includes('**Image URL:** https://example.com/hero.png')) throw new Error('expected OG image as header image')
    if (!md.includes('What is the programme?')) throw new Error('expected div text to be extracted')
    if (md.includes('var injected')) throw new Error('should not include script contents')
    if (md.includes('#rec123')) throw new Error('should not include style contents')
  } finally {
    restore()
  }
}

export async function testWebpageHtmlToMarkdownArtifactAvoidsSyntheticContentDuplicateAndRendersCardGridAsTable() {
  const { restore } = initJsdomHarness()
  try {
    const html = [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<title>Example Pricing</title>',
      '</head>',
      '<body>',
      '<main>',
      '  <section>',
      '    <section>For individuals and companies of up to 3 people</section>',
      '    <section>Free License</section>',
      '    <section>Create and automate</section>',
      '    <section>Commercial use allowed</section>',
      '    <section>Unlimited use</section>',
      '    <section>Must upgrade when your team grows</section>',
      '    <section>No sign up needed - get started</section>',
      '  </section>',
      '  <section>',
      '    <section>For collaborations and companies of 4+ people</section>',
      '    <section>Company License</section>',
      '    <section>Create and automate</section>',
      '    <section>Commercial use allowed</section>',
      '    <section>Pay according to usage</section>',
      '    <section>Prioritized Support</section>',
      '  </section>',
      '</main>',
      '</body>',
      '</html>',
    ].join('')

    const md = convertWebpageHtmlToMarkdownArtifact({ html, url: 'https://example.com/' })
    if (!md.includes('### Content')) throw new Error('expected synthetic Content section')
    if (md.includes('```\n## Content\n```')) throw new Error('should not emit original heading echo for Content')
    if (!md.includes('| Free License | Company License |')) throw new Error('expected pricing cards to render as markdown table')
    if (!md.includes('- Create and automate')) throw new Error('expected pricing cell bullets')
  } finally {
    restore()
  }
}

export async function testWebpageHtmlToMarkdownArtifactRendersLinkListsAndListItemLinks() {
  const { restore } = initJsdomHarness()
  try {
    const html = [
      '<!doctype html>',
      '<html>',
      '<head><title>Links</title></head>',
      '<body>',
      '<main>',
      '  <h1>Example</h1>',
      '  <h2>Companies</h2>',
      '  <section>',
      '    <a href="/openai">OpenAI</a>',
      '    <a href="/airbnb">Airbnb</a>',
      '    <a href="/stripe">Stripe</a>',
      '    <a href="/coinbase">Coinbase</a>',
      '  </section>',
      '  <h2>Stories</h2>',
      '  <ul>',
      '    <li><a href="/s05">During YC</a> Sam was part of YC\'s inaugural batch.</li>',
      '    <li><a href="/w09">During YC</a> Brian, Joe, and Nate did YC.</li>',
      '  </ul>',
      '</main>',
      '</body>',
      '</html>',
    ].join('')

    const md = convertWebpageHtmlToMarkdownArtifact({ html, url: 'https://example.com/' })
    if (!md.includes('- [OpenAI](https://example.com/openai)')) throw new Error('expected links list rendering')
    if (!md.includes('* [During YC](https://example.com/s05) Sam was part of YC\'s inaugural batch.')) {
      throw new Error('expected list item to preserve link markdown')
    }
  } finally {
    restore()
  }
}

export async function testWebpageHtmlToMarkdownArtifactAsyncAvoidsHtmlCodeFenceForSnapshot() {
  const { restore } = initJsdomHarness()
  try {
    const html = [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<title>Test</title>',
      '<meta name="referrer" content="no-referrer" />',
      '<base href="https://example.com/" />',
      '<link rel="canonical" href="/docs" />',
      '</head>',
      '<body>',
      '<main><h1>Hello</h1><p>World</p></main>',
      '<script>console.log("x")</script>',
      '</body>',
      '</html>',
    ].join('')

    const md = await convertWebpageHtmlToMarkdownArtifactAsync({
      html,
      url: 'https://example.com/',
      includeImages: true,
      fidelityLevel: 4,
      includeHtmlSnapshot: true,
    })
    if (!md.includes('## RAW HTML SNAPSHOT (Sanitized, No Scripts)')) throw new Error('expected raw html snapshot section')
    if (md.includes('```html')) throw new Error('expected snapshot to not be an html fenced block')
    if (!md.includes('- meta:')) throw new Error('expected snapshot markdown structure')
    if (!md.includes('name: referrer')) throw new Error('expected snapshot meta to render')
    if (!md.includes('content: no-referrer')) throw new Error('expected snapshot meta content to render')
    if (!md.includes('- link:')) throw new Error('expected snapshot link section')
    if (!md.includes('rel: canonical')) throw new Error('expected snapshot link rel to render')
    if (!md.includes('href: https://example.com/docs')) throw new Error('expected snapshot link href resolved against base')
    if (md.includes('console.log("x")')) throw new Error('expected scripts removed from snapshot')
  } finally {
    restore()
  }
}

export async function testWebpageHtmlToMarkdownArtifactAsyncUsesDataPageEmbeddedMarkdown() {
  const { restore } = initJsdomHarness()
  try {
    const embeddedMd = ['Demo Day', '', '![slide](https://example.com/slide.png)', '', '[Link](https://example.com)', ''].join('\n')
    const json = JSON.stringify({ props: { article: { title: 'Seed Deck', content: embeddedMd } } })
    const dataPageAttr = json.replace(/"/g, '&quot;')
    const html = ['<!doctype html>', '<html>', '<head><title>Ignored</title></head>', '<body>', `<section data-page="${dataPageAttr}"></section>`, '</body>', '</html>'].join('')

    const md = await convertWebpageHtmlToMarkdownArtifactAsync({ html, url: 'https://example.com/' })
    if (!md.includes('Demo Day')) throw new Error('expected embedded markdown content')
    if (!md.includes('![slide](https://example.com/slide.png)')) throw new Error('expected embedded image markdown')
    if (!md.includes('[Link](https://example.com)')) throw new Error('expected embedded link markdown')
    if (md.includes('TABLE OF CONTENTS')) throw new Error('expected ssot markdown, not artifact doc')
    if (md.includes('## HTML Head')) throw new Error('expected no HTML head section in ssot output')
  } finally {
    restore()
  }
}

export async function testWebpageHtmlToMarkdownArtifactPrefersCompleteRenderedArticle() {
  const { restore } = initJsdomHarness()
  try {
    const description = 'A short summary of the lesson.'
    const data = JSON.stringify({ props: { article: { title: 'A complete lesson', content: description } } }).replace(/"/g, '&quot;')
    const transcript = 'This is the complete captured explanation, beyond the short summary. '.repeat(8)
    const html = `<html><head><title>A complete lesson</title></head><body><nav>Unrelated navigation</nav>
      <div data-page="${data}"><section><div><h1>A complete lesson</h1><p>By the instructor</p></div>
      <iframe src="https://example.com/video"></iframe><div class="prose"><h2>Chapters</h2><ol><li>Introduction</li><li>Worked example</li></ol></div>
      <div class="prose"><p>${description}</p><h2>Transcript</h2><p>${transcript}</p></div></section></div><footer>Unrelated footer</footer></body></html>`
    for (const mode of ['ssot', 'debug'] as const) {
      for (const sourceHtml of [html, html.replace(/ data-page="[^"]*"/, ''), html.replace('<section>', '<article>').replace('</section>', '</article>')]) {
        const md = await convertWebpageHtmlToMarkdownArtifactAsync({ html: sourceHtml, url: 'https://unrelated.test/guide', mode, fidelityLevel: 4 })
        for (const expected of ['A complete lesson', 'By the instructor', 'https://example.com/video', '## Chapters', 'Worked example', '## Transcript', transcript.trim()]) {
          if (!md.includes(expected)) throw new Error(`${mode}: missing captured article content: ${expected.slice(0, 60)}`)
        }
        if (md.split(description).length !== 2) throw new Error('expected the description exactly once')
        if (md.includes('Unrelated navigation') || md.includes('Unrelated footer')) throw new Error('expected surrounding navigation excluded')
      }
    }
  } finally { restore() }
}

export async function testWebpageHtmlToMarkdownArtifactEmbeddedFallbackHonorsOptions() {
  const { restore } = initJsdomHarness()
  try {
    const data = JSON.stringify({ props: { article: { title: 'Lesson slides', content: 'Hydration only lesson.\n\n![slide](https://example.com/slide.png)' } } }).replace(/"/g, '&quot;')
    const html = `<html><head><title>Shell title</title></head><body><section data-page="${data}"></section></body></html>`
    const md = await convertWebpageHtmlToMarkdownArtifactAsync({ html, url: 'https://example.com/', mode: 'debug', includeImages: false, injectTitleHeading: true })
    if (!md.includes('# Lesson slides') || !md.includes('Hydration only lesson.')) throw new Error('expected embedded fallback despite head metadata')
    if (md.includes('slide.png')) throw new Error('expected image exclusion in fallback')
  } finally { restore() }
}

export async function testWebpageHtmlToMarkdownArtifactKeepsVisualRowsSeparate() {
  const { restore } = initJsdomHarness()
  try {
    const html = '<h1>Session schedule</h1><div class="flex"><a>09:00</a><div>Welcome</div></div><div style="display:flex"><a>09:15</a><div>Discussion</div></div>'
    const md = await convertWebpageHtmlToMarkdownArtifactAsync({ html, url: 'https://independent.test/events', fidelityLevel: 4 })
    if (!md.includes('[09:00]() Welcome\n\n[09:15]() Discussion')) throw new Error(`expected separate rows and cells: ${md}`)
  } finally { restore() }
}

export async function testWebsiteImportServerWritesArticleWithoutDiagnostics() {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const os = await import('node:os')
  const http = await import('node:http')
  const { createWebsiteImportHandler } = await import('@/lib/websites/server/websiteImportServer')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webpage-article-'))
  const previousStore = process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT
  process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT = path.join(root, 'store')
  const handler = createWebsiteImportHandler({ repoRoot: root })
  const server = http.createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  try {
    await fs.mkdir(path.join(root, 'pages'))
    await fs.writeFile(path.join(root, 'pages', 'guide.html'), '<head><title>Independent guide</title><meta name="diagnostic" content="capture metadata" /></head><article><h1>Independent guide</h1><h2>First section</h2><p>Complete usable article.</p><iframe src="https://media.example.test/video"></iframe></article>')
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const base = `http://127.0.0.1:${address.port}/__website_import`
    const start = await fetch(`${base}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'pages/guide.html', options: { maxPages: 1, concurrency: 1, discoverSitemap: false, generateMarkdownArtifacts: true } }) }).then(r => r.json()) as { importId: string }
    let done = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = await fetch(`${base}/status?importId=${start.importId}`).then(r => r.json()) as { status: string }
      if (status.status === 'done') { done = true; break }
      if (status.status === 'failed') throw new Error('local import failed')
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    if (!done) throw new Error('local import did not complete within the test budget')
    const manifest = await fetch(`${base}/manifest?importId=${start.importId}`).then(r => r.json()) as { manifest: { nodes: Array<{ nodeId: string }> } }
    const nodeId = manifest.manifest.nodes[0]?.nodeId
    const md = await fetch(`${base}/artifact?importId=${start.importId}&nodeId=${nodeId}&kind=markdown`).then(r => r.text())
    for (const expected of ['# Independent guide', '## First section', 'Complete usable article.', 'https://media.example.test/video']) {
      if (!md.includes(expected)) throw new Error(`server output missing ${expected}: ${md}; manifest=${JSON.stringify(manifest)}`)
    }
    if (/HTML Head|RAW HTML SNAPSHOT|capture metadata/.test(md)) throw new Error('capture diagnostics leaked into imported article')
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    if (previousStore === undefined) delete process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT
    else process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT = previousStore
    await fs.rm(root, { recursive: true, force: true })
  }
}
