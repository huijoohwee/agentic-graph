import { convertHtmlToMarkdownUnified } from '@/lib/markdown/htmlToMarkdownUnified'

export async function testHtmlToMarkdownUnifiedConvertsBasicHtml() {
  const res = await convertHtmlToMarkdownUnified({
    html: [
      '<h1>Hello</h1>',
      '<p>World</p>',
      '<a href="/docs">Docs</a>',
      '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>',
      '<iframe src="https://example.com/embed"></iframe>',
      '<details open><summary>More</summary><p>Details body</p></details>',
    ].join(''),
    baseUrl: 'https://example.com/',
  })
  if (res.ok !== true) throw new Error(`expected ok, got error: ${(res as { error?: unknown }).error || ''}`)
  const md = res.markdown
  if (!md.includes('# Hello')) throw new Error('expected heading')
  if (!md.toLowerCase().includes('world')) throw new Error('expected paragraph')
  if (!md.includes('(https://example.com/docs)')) throw new Error('expected resolved link')
  if (md.includes('<svg')) throw new Error('expected svg to be stripped')
  if (md.includes('<iframe')) throw new Error('expected iframe to be converted to markdown')
  if (!md.includes('https://example.com/embed')) throw new Error('expected iframe src preserved')
  if (!md.includes('Details body')) throw new Error('expected details body preserved')
}

export async function testHtmlToMarkdownUnifiedHeadOnlyRendersHeadSection() {
  const res = await convertHtmlToMarkdownUnified({
    html: [
      '<title>Sample article</title>',
      '<base href="https://docs.fixture.invalid/" />',
      '<meta name="description" content="Example articles" />',
      '<link rel="canonical" href="/articles/sample-article" />',
    ].join('\n'),
    includeHeadSection: true,
  })
  if (res.ok !== true) throw new Error(`expected ok, got error: ${(res as { error?: unknown }).error || ''}`)
  const md = res.markdown
  if (!md.includes('## HTML Head')) throw new Error('expected head section')
  if (!md.includes('Sample article')) throw new Error('expected title in head section')
  if (!md.includes('https://docs.fixture.invalid/articles/sample-article')) {
    throw new Error('expected canonical resolved via base')
  }
}

export async function testHtmlToMarkdownUnifiedPreservesPreCodeIndentation() {
  const res = await convertHtmlToMarkdownUnified({
    html: ['<pre><code># print(&quot;Exception when calling api: %s\\n&quot; % e)', '        pass', '</code></pre>'].join('\n'),
  })
  if (res.ok !== true) throw new Error(`expected ok, got error: ${(res as { error?: unknown }).error || ''}`)
  const md = res.markdown
  if (!md.includes('```')) throw new Error('expected fenced code block')
  if (!md.includes('# print("Exception when calling api: %s\\n" % e)')) {
    throw new Error(`expected code line preserved, got:\n${md}`)
  }
  if (!md.includes('\n        pass\n')) throw new Error('expected indentation preserved')
}

export async function testHtmlToMarkdownUnifiedPreservesChineseText() {
  const s = '通过 ChatGPT 免费套餐和 Go 套餐免费试用 Codex；其他所有套餐的用户可限时享受双倍速率额度。'
  const res = await convertHtmlToMarkdownUnified({
    html: `<p>${s}</p>`,
  })
  if (res.ok !== true) throw new Error(`expected ok, got error: ${(res as { error?: unknown }).error || ''}`)
  const md = res.markdown
  if (!md.includes(s)) throw new Error('expected chinese text preserved')
}

export async function testHtmlToMarkdownUnifiedUsesBaseTagForLinkResolution() {
  const base = 'https://api.byteplus.com/api-sdk/view?serviceCode=ecs'
  const res = await convertHtmlToMarkdownUnified({
    html: [
      `<head><base href="${base}" /></head>`,
      '<a href="#print">Anchor</a>',
      '<a href="/api-sdk/view?serviceCode=ecs">Abs</a>',
    ].join('\n'),
  })
  if (res.ok !== true) throw new Error(`expected ok, got error: ${(res as { error?: unknown }).error || ''}`)
  const md = res.markdown
  if (!md.includes(`(${base}#print)`)) {
    throw new Error('expected anchor resolved against base href')
  }
  if (!md.includes('(https://api.byteplus.com/api-sdk/view?serviceCode=ecs)')) {
    throw new Error('expected absolute-path link resolved against base href origin')
  }
}

export async function testHtmlToMarkdownUnifiedPreservesNoscriptContent() {
  const res = await convertHtmlToMarkdownUnified({
    html: ['<noscript>', '<h2>Fallback</h2>', '<p>Rendered without JS</p>', '</noscript>'].join('\n'),
  })
  if (res.ok !== true) throw new Error(`expected ok, got error: ${(res as { error?: unknown }).error || ''}`)
  const md = res.markdown
  if (!md.includes('Fallback')) throw new Error('expected noscript heading preserved')
  if (!md.includes('Rendered without JS')) throw new Error('expected noscript paragraph preserved')
}

export async function testHtmlToMarkdownUnifiedParsesFullHtmlDocument() {
  const html =
    '<!doctype html><html><head><title>Test Page</title></head><body><h1>Source Faithful Heading</h1><p>First section</p></body></html>'
  const res = await convertHtmlToMarkdownUnified({
    html,
    baseUrl: 'https://grapesjs.com/pricing',
    fidelityLevel: 4,
    includeHeadSection: true,
  })
  if (res.ok !== true) throw new Error(`expected ok, got error: ${(res as { error?: unknown }).error || ''}`)
  if (!res.markdown.includes('# Source Faithful Heading')) throw new Error('expected h1 conversion from full document html')
}

export async function testHtmlToMarkdownUnifiedRemovesHeadingPermalinkSvgAnchor() {
  const url = 'https://www.citriniresearch.com/p/2028gic'
  const html = [
    '<h1>',
    '<strong>Preface</strong>',
    `<a class="headerlink" href="${url}" aria-label="Permalink">`,
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="24"></svg>',
    '</a>',
    '</h1>',
  ].join('')
  const res = await convertHtmlToMarkdownUnified({
    html,
    baseUrl: url,
    fidelityLevel: 4,
    includeImages: true,
    includeHeadSection: false,
    maxInputChars: 200_000,
  })
  if (res.ok !== true) throw new Error(`expected ok, got error: ${(res as { error?: unknown }).error || ''}`)
  const md = res.markdown
  if (!md.includes('# **Preface**')) throw new Error(`expected heading text preserved, got: ${md.slice(0, 200)}`)
  if (/data:image\/svg\+xml;base64,/i.test(md)) throw new Error('expected heading permalink svg to be removed')
  if (new RegExp(`\\(${url.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\)`).test(md)) {
    throw new Error(`expected heading permalink link to be removed, got:\n${md}`)
  }
}

export async function testHtmlToMarkdownUnifiedRemovesHeadingHashAnchorIconOnly() {
  const html = [
    '<h2 id="preface">',
    'Preface',
    '<a href="#preface" class="hash-link" title="Direct link to heading">',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" aria-hidden="true"></svg>',
    '</a>',
    '</h2>',
  ].join('')
  const res = await convertHtmlToMarkdownUnified({
    html,
    baseUrl: 'https://example.invalid/',
    fidelityLevel: 4,
    includeImages: true,
    includeHeadSection: false,
    maxInputChars: 200_000,
  })
  if (res.ok !== true) throw new Error(`expected ok, got error: ${(res as { error?: unknown }).error || ''}`)
  const md = res.markdown
  if (!md.includes('## Preface')) throw new Error(`expected heading text preserved, got: ${md.slice(0, 200)}`)
  if (/data:image\/svg\+xml;base64,/i.test(md)) throw new Error('expected heading hash icon to be removed')
  if (/\(#preface\)/.test(md)) throw new Error('expected heading hash link to be removed')
}

export async function testHtmlToMarkdownUnifiedUsesWeChatArticleRootAndLazyImages() {
  const lazyUrl = 'https://mmbiz.qpic.cn/mmbiz_png/U2TOjNEaJcZqyexN2PPWt8fprzPefoobLKnzL3DEzicAX2ibmEVc8tm9icJmaaicibIlRSOiaI03aY1YnsKjYLJmdk9Q/640?wx_fmt=png'
  const ornamentUrl = 'https://mmbiz.qpic.cn/mmbiz_png/U2TOjNEaJcZqyexN2PPWt8fprzPefoobBx5dmJIytUu6pTqSx4tudwNXOtJJnXjPOVOIsiacia2glyjjwKkRB0Bg/640?wx_fmt=png'
  const placeholder = "data:image/svg+xml,%3Csvg width='1px' height='1px' viewBox='0 0 1 1'%3E%3C/svg%3E"
  const html = [
    '<!doctype html><html><head><title>WeChat title</title></head><body>',
    '<h1>Publisher chrome should not be imported</h1>',
    '<a href="javascript:void(0);">Open App</a>',
    '<section id="js_content" class="rich_media_content">',
    '<p>一幅讴歌客家先民的</p>',
    '<p>壮丽画卷</p>',
    '<p>赣州是客家先民中原南迁的第一站，是客家民系孕育成熟的重要摇篮。这里山川绵延、江河汇聚，先民在迁徙、拓垦、守望与融合中留下了厚重的文化记忆。</p>',
    '<p>由老艺术家创作的长卷作品以恢宏构图记录客家先民跋山涉水、筚路蓝缕的历史图景，也呈现围屋、祠堂、书院、桥梁、古道与田园生活交织而成的精神谱系。</p>',
    '<p>画面中的人物、器物、建筑与山水互为线索，既有历史叙事的纵深，也有民俗风情的细节。作品通过连续场景展开，表现客家人崇文重教、开拓进取、守望相助的文化气质。</p>',
    '<p>这组内容用于模拟公众号正文的真实文本密度，确保内容根选择逻辑面对足量正文时优先提取文章本体，而不是误收页面标题、打开客户端按钮或相关推荐等外层阅读器界面。</p>',
    `<img alt="图片" src="${placeholder}" data-src="${lazyUrl}" data-w="1025" />`,
    '<section style="text-align:center;display:flex">',
    `<img alt="ornament" src="${placeholder}" data-src="${ornamentUrl}" />`,
    '<p><strong>作品赏析</strong></p>',
    '</section>',
    '</section>',
    '<footer>Related article chrome</footer>',
    '</body></html>',
  ].join('')
  const res = await convertHtmlToMarkdownUnified({
    html,
    baseUrl: 'https://mp.weixin.qq.com/s/test',
    fidelityLevel: 4,
    includeImages: true,
    includeHeadSection: false,
    maxInputChars: 200_000,
  })
  if (res.ok !== true) throw new Error(`expected ok, got error: ${(res as { error?: unknown }).error || ''}`)
  const md = res.markdown
  if (md.includes('Publisher chrome') || md.includes('Open App') || md.includes('Related article chrome')) {
    throw new Error(`expected WeChat article root to exclude page chrome, got:\n${md}`)
  }
  if (!md.includes('一幅讴歌客家先民的') || !md.includes('作品赏析')) throw new Error(`expected article text preserved, got:\n${md}`)
  if (!md.includes(lazyUrl) || !md.includes(ornamentUrl)) throw new Error(`expected lazy WeChat image data-src urls preserved, got:\n${md}`)
  if (/data:image\/svg\+xml/i.test(md)) throw new Error(`expected placeholder svg src to be replaced, got:\n${md}`)
  if (/U2TOjNEaJcZqyexN\s+2PPWt/i.test(md)) throw new Error(`expected media urls inside preserved html to avoid word-break spaces, got:\n${md}`)
}
