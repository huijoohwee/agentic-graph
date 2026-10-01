import { applyParser, builtInParsers, registerParser, resetParsers, toParserId } from '@/features/parsers'
import { buildMarkdownJsonLd } from '@/features/parsers/default'

export async function testMarkdownGithubBlobIngestionProducesMediaNodes() {
  resetParsers()
  builtInParsers.forEach(p => registerParser(p))

  const markdown = [
    '# Title',
    '',
    'Paragraph with an image:',
    '',
    '![Alt text](/owner/repo/raw/main/image.png)',
    '',
  ].join('\n')

  const jsonld = buildMarkdownJsonLd(
    'https://github.com/owner/repo/blob/main/chapter-summaries.md',
    markdown,
  )

  const res = applyParser(toParserId('jsonld'), {
    name: 'doc.jsonld',
    text: JSON.stringify(jsonld),
  })

  if (!res) throw new Error('jsonld parse returned null')
  if (res.warnings && res.warnings.length > 0) {
    throw new Error(`jsonld parse warnings: ${res.warnings.join('; ')}`)
  }

  const nodes = res.graphData.nodes || []
  const mediaNodes = nodes.filter(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    const url = String(props.media_url || props.url || '')
    const kind = String(props.media_kind || '')
    return !!url && (kind === 'image' || !kind)
  })

  if (mediaNodes.length === 0) {
    throw new Error('expected at least one media-capable node from markdown inline image')
  }

  await Promise.resolve()
}

export async function testMarkdownHtmlImgIngestionProducesMediaNodes() {
  resetParsers()
  builtInParsers.forEach(p => registerParser(p))

  const markdown = [
    '# Title',
    '',
    'Paragraph with HTML image:',
    '',
    '<center><img src="assets/ai-judge.png" width="600"><br></center>',
    '',
  ].join('\n')

  const jsonld = buildMarkdownJsonLd(
    'https://github.com/owner/repo/blob/main/chapter-summaries.md',
    markdown,
  )

  const res = applyParser(toParserId('jsonld'), {
    name: 'doc.jsonld',
    text: JSON.stringify(jsonld),
  })

  if (!res) throw new Error('jsonld parse returned null')
  if (res.warnings && res.warnings.length > 0) {
    throw new Error(`jsonld parse warnings: ${res.warnings.join('; ')}`)
  }

  const nodes = res.graphData.nodes || []
  const mediaNodes = nodes.filter(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    const url = String(props.media_url || props.url || '')
    const kind = String(props.media_kind || '')
    return !!url && (kind === 'image' || !kind)
  })

  if (mediaNodes.length === 0) {
    throw new Error('expected at least one media-capable node from html img tag')
  }

  await Promise.resolve()
}

export async function testMarkdownAutolinkImageIngestionProducesMediaNodes() {
  resetParsers()
  builtInParsers.forEach(p => registerParser(p))

  const url =
    'https://substackcdn.com/image/fetch/$s_!kA4x!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F0bc01ebb-a883-4e5c-bd2b-fa7aaa872edb_1600x1059.png'
  const markdown = ['# Title', '', `<${url}>`, '', url, ''].join('\n')

  const jsonld = buildMarkdownJsonLd('https://example.invalid/doc.md', markdown)
  const res = applyParser(toParserId('jsonld'), { name: 'doc.jsonld', text: JSON.stringify(jsonld) })
  if (!res) throw new Error('jsonld parse returned null')
  if (res.warnings && res.warnings.length > 0) throw new Error(`jsonld parse warnings: ${res.warnings.join('; ')}`)

  const nodes = res.graphData.nodes || []
  const mediaNodes = nodes.filter(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    const kind = String(props.media_kind || '')
    const mediaUrl = String(props.media_url || '')
    return kind === 'image' && mediaUrl.includes('substackcdn.com/image/fetch')
  })
  if (mediaNodes.length === 0) throw new Error('expected image media node from autolink/bare image URL')
  await Promise.resolve()
}

export async function testMarkdownHtmlIframeIngestionProducesMediaNodes() {
  resetParsers()
  builtInParsers.forEach(p => registerParser(p))

  const markdown = [
    '# Title',
    '',
    'Paragraph with HTML iframe:',
    '',
    '<iframe src="https://docs.fixture.invalid/articles/sample-article"></iframe>',
    '',
  ].join('\n')

  const jsonld = buildMarkdownJsonLd('https://example.invalid/doc.md', markdown)
  const res = applyParser(toParserId('jsonld'), { name: 'doc.jsonld', text: JSON.stringify(jsonld) })
  if (!res) throw new Error('jsonld parse returned null')
  if (res.warnings && res.warnings.length > 0) throw new Error(`jsonld parse warnings: ${res.warnings.join('; ')}`)

  const nodes = res.graphData.nodes || []
  const iframeNodes = nodes.filter(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    const kind = String(props.media_kind || '')
    const url = String(props.iframe_url || props.media_url || props.url || '')
    return kind === 'iframe' && /docs\.fixture\.invalid\/articles\/sample-article/i.test(url)
  })
  if (iframeNodes.length === 0) throw new Error('expected iframe media node from html iframe tag')
  const iframeProps = (iframeNodes[0]?.properties || {}) as Record<string, unknown>
  if (!String(iframeProps.media_url || '').includes('docs.fixture.invalid/articles/sample-article')) throw new Error('expected html iframe media_url alias')
  if (!String(iframeProps.media || '').includes('docs.fixture.invalid/articles/sample-article')) throw new Error('expected html iframe generic media URL property')
  if (iframeProps.media_interactive !== true) throw new Error('expected html iframe to stay interactive')
  await Promise.resolve()
}

export async function testMarkdownHtmlIframeSrcdocIngestionProducesMediaNodes() {
  resetParsers()
  builtInParsers.forEach(p => registerParser(p))

  const markdown = [
    '# Title',
    '',
    'Paragraph with HTML iframe srcdoc:',
    '',
    '<iframe title="Inline" srcdoc="<section style=\'font-family: ui-sans-serif\'><h1>Hello</h1><p>Inline iframe</p></section>"></iframe>',
    '',
  ].join('\n')

  const jsonld = buildMarkdownJsonLd('https://example.invalid/doc.md', markdown)
  const res = applyParser(toParserId('jsonld'), { name: 'doc.jsonld', text: JSON.stringify(jsonld) })
  if (!res) throw new Error('jsonld parse returned null')
  if (res.warnings && res.warnings.length > 0) throw new Error(`jsonld parse warnings: ${res.warnings.join('; ')}`)

  const nodes = res.graphData.nodes || []
  const iframeSrcdocNodes = nodes.filter(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    const kind = String(props.media_kind || '')
    const tag = String(props['dom:tag'] || '')
    const srcdoc = String(props['dom:attrs:srcdoc'] || '')
    return kind === 'iframe' && tag.toUpperCase() === 'IFRAME' && srcdoc.includes('<h1>Hello</h1>')
  })
  if (iframeSrcdocNodes.length === 0) throw new Error('expected iframe srcdoc to ingest as media-capable node')
  await Promise.resolve()
}

export async function testMarkdownStandaloneLinkWebpageIngestionProducesIframeNode() {
  resetParsers()
  builtInParsers.forEach(p => registerParser(p))

  const markdown = [
    '# Title',
    '',
    '[Article](https://www.aljazeera.com/news/2026/2/19/visualising-ai-spending-how-does-it-compare-with-historys-mega-projects)',
    '',
    '[YouTube](https://youtu.be/XzzPRQRDcDw?t=2997)',
    '',
    '[Tweet](https://x.com/HuiJooHwee/status/2023774971982672097?s=20)',
    '',
    '[Bilibili](https://www.bilibili.com/video/BV15KqbBaEAG)',
    '',
    '<iframe src="https://www.linkedin.com/embed/feed/update/urn:li:ugcPost:7423892590258798592" height="800" width="504" frameborder="0" allowfullscreen="" title="Embedded post"></iframe>',
    '',
    '<blockquote class="reddit-embed-bq" data-embed-height="969">',
    '<a href="https://www.reddit.com/r/Trae_ai/comments/1ovcca2/comment/nojw5gz/">Comment</a>',
    '</blockquote><script async src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>',
    '',
  ].join('\n')

  const jsonld = buildMarkdownJsonLd('https://example.invalid/doc.md', markdown)
  const res = applyParser(toParserId('jsonld'), { name: 'doc.jsonld', text: JSON.stringify(jsonld) })
  if (!res) throw new Error('jsonld parse returned null')
  if (res.warnings && res.warnings.length > 0) throw new Error(`jsonld parse warnings: ${res.warnings.join('; ')}`)

  const nodes = res.graphData.nodes || []

  const hasAljazeeraIframe = nodes.some(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    return (
      String(props.media_kind || '') === 'iframe'
      && String(props.iframe_url || '').includes('aljazeera.com/news/2026/2/19/')
      && String(props.media_url || '').includes('aljazeera.com/news/2026/2/19/')
      && String(props.media || '').includes('aljazeera.com/news/2026/2/19/')
      && props.media_interactive === true
    )
  })
  if (!hasAljazeeraIframe) throw new Error('expected standalone webpage link to ingest as iframe media node')

  const hasNoCookieYoutubeEmbed = nodes.some(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    const src = String(props.iframe_url || '')
    return String(props.media_kind || '') === 'iframe' && src.startsWith('https://www.youtube-nocookie.com/embed/') && src.includes('?start=')
  })
  if (!hasNoCookieYoutubeEmbed) throw new Error('expected youtube standalone link to ingest as youtube-nocookie iframe embed with start')

  const hasTweetEmbed = nodes.some(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    return String(props.media_kind || '') === 'iframe' && String(props.iframe_url || '').includes('platform.twitter.com/embed/Tweet.html?id=2023774971982672097')
  })
  if (!hasTweetEmbed) throw new Error('expected x.com status to ingest as platform.twitter.com tweet iframe embed')

  const hasBilibiliEmbed = nodes.some(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    const src = String(props.iframe_url || '')
    return String(props.media_kind || '') === 'iframe' && src.includes('player.bilibili.com/player.html') && src.includes('bvid=BV15KqbBaEAG')
  })
  if (!hasBilibiliEmbed) throw new Error('expected bilibili standalone link to ingest as player.bilibili.com iframe embed')

  const hasLinkedInEmbed = nodes.some(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    return String(props.media_kind || '') === 'iframe' && String(props.iframe_url || '').includes('linkedin.com/embed/feed/update/')
  })
  if (!hasLinkedInEmbed) throw new Error('expected linkedin embed iframe to ingest as iframe media node')

  const hasRedditScriptEmbed = nodes.some(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    return String(props.media_kind || '') === 'iframe' && String(props.iframe_url || '').includes('reddit.com/r/Trae_ai/comments/1ovcca2/comment/nojw5gz/')
  })
  if (!hasRedditScriptEmbed) throw new Error('expected reddit script embed to ingest as iframe media node')

  await Promise.resolve()
}

export async function testMarkdownInlineImageLinkIngestionProducesImageMediaNode() {
  resetParsers()
  builtInParsers.forEach(p => registerParser(p))

  const markdown = [
    '# Title',
    '',
    'Inline markdown link to image:',
    '[cover](https://mmbiz.qpic.cn/mmbiz_png/test/640?wx_fmt=png&from=appmsg)',
    '',
  ].join('\n')

  const jsonld = buildMarkdownJsonLd('https://example.invalid/doc.md', markdown)
  const res = applyParser(toParserId('jsonld'), { name: 'doc.jsonld', text: JSON.stringify(jsonld) })
  if (!res) throw new Error('jsonld parse returned null')
  if (res.warnings && res.warnings.length > 0) throw new Error(`jsonld parse warnings: ${res.warnings.join('; ')}`)

  const nodes = res.graphData.nodes || []
  const hasMediaImageLink = nodes.some(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    return (
      String(props.media_kind || '') === 'image'
      && String(props.media_url || '').includes('mmbiz.qpic.cn/mmbiz_png/test/640')
      && String(props.image || '').includes('mmbiz.qpic.cn/mmbiz_png/test/640')
      && String(props.media || '').includes('mmbiz.qpic.cn/mmbiz_png/test/640')
    )
  })
  if (!hasMediaImageLink) throw new Error('expected markdown []() image link to ingest as image media node')
}

export async function testMarkdownHtmlVideoIngestionProducesMediaNodes() {
  resetParsers()
  builtInParsers.forEach(p => registerParser(p))

  const markdown = [
    '# Title',
    '',
    'Video block:',
    '',
    '<video controls><source src="https://example.invalid/demo.mp4" type="video/mp4" /></video>',
    '',
  ].join('\n')

  const jsonld = buildMarkdownJsonLd('https://example.invalid/doc.md', markdown)
  const res = applyParser(toParserId('jsonld'), { name: 'doc.jsonld', text: JSON.stringify(jsonld) })
  if (!res) throw new Error('jsonld parse returned null')
  if (res.warnings && res.warnings.length > 0) throw new Error(`jsonld parse warnings: ${res.warnings.join('; ')}`)

  const nodes = res.graphData.nodes || []
  const videoNodes = nodes.filter(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    const kind = String(props.media_kind || '')
    const url = String(props.video || props.media_url || props.url || '')
    return kind === 'video' && /demo\.mp4/i.test(url)
  })
  if (videoNodes.length === 0) throw new Error('expected video media node from html video tag')
  const videoProps = (videoNodes[0]?.properties || {}) as Record<string, unknown>
  if (!String(videoProps.media_url || '').includes('demo.mp4')) throw new Error('expected html video media_url alias')
  if (!String(videoProps.media || '').includes('demo.mp4')) throw new Error('expected html video generic media URL property')
  if (videoProps.media_interactive !== true) throw new Error('expected html video to stay interactive')
  await Promise.resolve()
}
