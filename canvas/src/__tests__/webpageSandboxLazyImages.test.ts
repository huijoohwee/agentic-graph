import { buildWebpageHtmlSrcdoc } from '@/lib/websites/webpageIframeSrcdoc'

const formatHintImageUrl = 'https://assets.example/images/640?asset_fmt=png'

export async function testWebpageSandboxPromotesLazyImageDataSrc() {
  const raw = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"></head><body>',
    '<h1>Hello</h1>',
    `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-src="${formatHintImageUrl}" />`,
    '</body></html>',
  ].join('')

  const globals = globalThis as unknown as { window?: unknown }
  const previousWindow = globals.window
  try {
    for (const origin of ['', 'http://localhost:1234']) {
      globals.window = origin ? { location: { origin } } : undefined
      const out = buildWebpageHtmlSrcdoc({ html: raw, baseHref: 'https://example.com/page', scriptPolicy: 'strip' })
      const expectedSrc = `${origin}/__webpage_asset_path/https%3A%2F%2Fassets.example/images/640?asset_fmt=png`
      if (!out.includes(`src="${expectedSrc}"`)) throw new Error(`expected promoted img src ${expectedSrc} in sandbox html`)
    }
  } finally {
    globals.window = previousWindow
  }
}

export async function testWebpageSandboxProxiesFormatHintImgSrc() {
  const raw = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"></head><body>',
    `<img src="${formatHintImageUrl}" />`,
    '</body></html>',
  ].join('')
  const out = buildWebpageHtmlSrcdoc({ html: raw, baseHref: 'https://example.com/page', scriptPolicy: 'strip' })
  if (!out.includes('/__webpage_asset_path/https%3A%2F%2Fassets.example/images/640?asset_fmt=png')) {
    throw new Error('expected format-hinted image src to be rewritten to asset-path proxy')
  }
}

export async function testWebpageSandboxRevealsHiddenContentRoot() {
  const raw = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"></head><body>',
    '<section class="rich_media_content" id="js_content" style="opacity:0;visibility:hidden">X</section>',
    '</body></html>',
  ].join('')
  const out = buildWebpageHtmlSrcdoc({ html: raw, baseHref: 'https://example.com/page', scriptPolicy: 'strip' })
  if (!out.includes('data-kg-content-unhide="1"')) {
    throw new Error('expected hidden content unhide style to be injected')
  }
}

export async function testWebpageSandboxAbsolutizesLocalProxyUrlsInsteadOfChangingBase() {
  const g = globalThis as unknown as { window?: unknown }
  const prevWindow = g.window
  try {
    g.window = { location: { origin: 'http://localhost:1234' } }
    const raw = [
      '<!doctype html>',
      '<html><head><meta charset="utf-8"></head><body>',
      `<img src="${formatHintImageUrl}" />`,
      '</body></html>',
    ].join('')
    const out = buildWebpageHtmlSrcdoc({ html: raw, baseHref: 'https://example.com/page', scriptPolicy: 'strip' })
    if (!out.includes('<base href="https://example.com/page">')) {
      throw new Error('expected sandbox base href to remain the source url')
    }
    if (!out.includes('src="http://localhost:1234/__webpage_asset_path/')) {
      throw new Error('expected sandbox to absolutize local proxy asset urls')
    }
  } finally {
    g.window = prevWindow
  }
}
