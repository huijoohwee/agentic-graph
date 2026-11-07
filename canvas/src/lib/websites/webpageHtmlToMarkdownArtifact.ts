import { stripOversizedHydrationAttributes } from '../markdown/htmlToMarkdownHast'
import { renderHtmlSnapshotMarkdown } from './webpageHtmlSnapshotMarkdown'
import { renderAsciiFrame } from './webpageMarkdownArtifactAscii'
import { normalizeInline, stripTrailingPunctuation } from './webpageMarkdownArtifactAsciiPrivate'
import { assertHtmlInputBudget, convertHtmlToMarkdownUnified } from '../markdown/htmlToMarkdownUnified'
import { postprocessWebpageMarkdownSsot } from '../markdown/webpageMarkdownPostprocess'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import {
  escapeMarkdownText,
  extractAssets,
  extractLogoCandidates,
  extractMainSections,
  extractNavMenus,
  extractPlatform,
  extractSkipLink,
  formatRelativeHref,
  hasMenuToggleButton,
  pickFooterRoot,
  pickHeaderRoot,
  pickHeroImage,
  pickPrimaryContentRoot,
  resolveUrl,
  renderSimpleBox,
  safeText,
  scrapeDate,
  scrapeDateTime,
  slugify,
  type AssetKind,
} from './webpageHtmlToMarkdownArtifactPrivate'

const yieldToMain = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

const decodeHtmlEntitiesBasic = (text: string): string => {
  const src = String(text || '')
  if (!src.includes('&')) return src
  return src
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

const tryExtractMarkdownFromDataPage = (html: string): { title: string; markdown: string } | null => {
  const raw = String(html || '')
  if (!raw.includes('data-page=')) return null
  const m = raw.match(/\bdata-page\s*=\s*"([^"]+)"/i) || raw.match(/\bdata-page\s*=\s*'([^']+)'/i)
  const payload = m ? String(m[1] || '').trim() : ''
  if (!payload) return null
  const decoded = decodeHtmlEntitiesBasic(payload)
  if (!decoded.includes('{') || !decoded.includes('}')) return null
  try {
    const parsed = JSON.parse(decoded) as unknown
    const p = parsed as {
      props?: {
        article?: { title?: unknown; content?: unknown }
      }
    }
    const title = p?.props?.article?.title != null ? String(p.props.article.title || '').trim() : ''
    const content = p?.props?.article?.content != null ? String(p.props.article.content || '').trim() : ''
    if (!content) return null
    return { title, markdown: content }
  } catch {
    return null
  }
}

const splitNonEmptyLines = (text: string): string[] => {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
}

const isPlainCardBlock = (block: string): boolean => {
  const raw = String(block || '').trim()
  if (!raw) return false
  if (raw.startsWith('```') || raw.includes('|---') || raw.startsWith('#') || raw.startsWith('* ') || raw.startsWith('- ')) return false
  if (raw.includes('<') || raw.includes('](')) return false
  const lines = splitNonEmptyLines(raw)
  if (lines.length < 3 || lines.length > 16) return false
  const tooLong = lines.some(l => l.length > 96)
  if (tooLong) return false
  const avg = lines.reduce((s, l) => s + l.length, 0) / Math.max(1, lines.length)
  if (avg > 64) return false
  return true
}

const pickCardTitle = (lines: string[]): { title: string; rest: string[] } => {
  const first = lines.slice(0, 3)
  let bestIdx = 0
  let bestLen = Number.POSITIVE_INFINITY
  for (let i = 0; i < first.length; i += 1) {
    const l = first[i] || ''
    const len = l.length
    if (len >= 3 && len <= 48 && len < bestLen) {
      bestLen = len
      bestIdx = i
    }
  }
  const title = lines[bestIdx] || lines[0] || 'Card'
  const rest = lines.filter((_, i) => i !== bestIdx)
  return { title, rest }
}

const escapeTableCell = (text: string): string => {
  return escapeMarkdownText(String(text || '')).replace(/\\\|/g, '|').trim()
}

const formatPlainLinesAsBulletsInTableCell = (lines: string[]): string => {
  const items = lines.map(l => String(l || '').trim()).filter(Boolean)
  if (!items.length) return ''
  return items.map(it => `- ${escapeTableCell(it)}`).join(' · ')
}

const isPlainListBlock = (block: string): boolean => {
  const raw = String(block || '').trim()
  if (!raw) return false
  if (raw.startsWith('```') || raw.includes('|---') || raw.startsWith('#') || raw.startsWith('* ') || raw.startsWith('- ') || raw.startsWith('> ')) return false
  if (raw.includes('<') || raw.includes('](')) return false
  const lines = splitNonEmptyLines(raw)
  if (lines.length < 3 || lines.length > 24) return false
  const tooLong = lines.some(l => l.length > 96)
  if (tooLong) return false
  const avg = lines.reduce((s, l) => s + l.length, 0) / Math.max(1, lines.length)
  if (avg > 72) return false
  return true
}

const normalizeBlockMarkdown = (block: string): string => {
  const raw = String(block || '').trim()
  if (!raw) return ''
  if (isPlainListBlock(raw)) {
    const lines = splitNonEmptyLines(raw)
    return lines.map(l => `- ${escapeMarkdownText(l)}`).join('\n')
  }
  return raw
}

const coalesceCardBlocksToMarkdownTable = (blocks: string[]): string[] => {
  const out: string[] = []
  let i = 0
  while (i < blocks.length) {
    const cur = blocks[i] || ''
    if (!isPlainCardBlock(cur)) {
      out.push(normalizeBlockMarkdown(cur))
      i += 1
      continue
    }
    const group: string[] = []
    let j = i
    while (j < blocks.length && group.length < 4) {
      const b = blocks[j] || ''
      if (!isPlainCardBlock(b)) break
      group.push(b)
      j += 1
    }
    if (group.length < 2) {
      out.push(normalizeBlockMarkdown(cur))
      i += 1
      continue
    }
    const parsed = group.map(b => splitNonEmptyLines(b))
    const cards = parsed.map(lines => pickCardTitle(lines))
    const headers = cards.map(c => escapeTableCell(c.title))
    const cells = cards.map(c => formatPlainLinesAsBulletsInTableCell(c.rest))
    out.push(serializeMarkdownPipeTable({ columns: headers, rows: [cells] }).join('\n'))
    i = j
  }
  return out
}

export async function convertWebpageHtmlToMarkdownArtifactAsync(args: {
  html: string
  url: string
  includeImages?: boolean
  fidelityLevel?: 1 | 2 | 3 | 4
  includeHeadSection?: boolean
  injectTitleHeading?: boolean
  mode?: 'ssot' | 'artifact' | 'debug'
  includeHtmlSnapshot?: boolean
  onProgress?: (step: string) => void
}): Promise<string> {
  const raw = String(args.html || '')
  assertHtmlInputBudget(raw, 32_000_000)
  const renderableHtml = stripOversizedHydrationAttributes(raw)
  assertHtmlInputBudget(renderableHtml, 10_000_000)
  if (raw.length > 120_000) await yieldToMain()
  args.onProgress?.('Converting HTML')
  if (raw.length > 120_000) await yieldToMain()
  const mode = args.mode || 'ssot'

  const embedded = tryExtractMarkdownFromDataPage(raw)
  let fallbackMarkdown = ''
  if (embedded && embedded.markdown.trim()) {
    const withoutImages =
      args.includeImages === false ? embedded.markdown.replace(/^!\[[^\]]*]\([^)]+\)\s*$/gm, '').trim() : embedded.markdown
    const withTitle =
      args.injectTitleHeading === true && embedded.title && !String(withoutImages || '').trim().startsWith('#')
        ? [`# ${embedded.title}`, '', withoutImages.trim()].join('\n')
        : withoutImages.trim()
    fallbackMarkdown = withTitle
  }

  let fullText = ''
  try {
    const unified = await convertHtmlToMarkdownUnified({
      html: renderableHtml,
      fallbackMarkdown,
      baseUrl: args.url,
      maxInputChars: 10_000_000,
      includeImages: args.includeImages !== false,
      fidelityLevel: args.fidelityLevel,
      includeHeadSection: args.includeHeadSection === true || mode === 'debug',
      injectTitleHeading: args.injectTitleHeading,
    })
    if (unified.ok === true && unified.markdown.trim()) {
      fullText = unified.markdown.trim()
    }
  } catch {
    void 0
  }

  if (mode === 'artifact') {
    return convertWebpageHtmlToMarkdownArtifact({ html: raw, url: args.url })
  }

  if (!fullText) fullText = fallbackMarkdown
  if (!fullText) return convertWebpageHtmlToMarkdownArtifact({ html: raw, url: args.url })
  if (mode === 'ssot') return postprocessWebpageMarkdownSsot(fullText)

  const htmlSanitized = raw.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').trim()

  const sections: string[] = []
  sections.push(fullText)
  sections.push('')

  const includeHtmlSnapshot = args.includeHtmlSnapshot === true || mode === 'debug'
  if (includeHtmlSnapshot && htmlSanitized) {
    sections.push('---')
    sections.push('')
    sections.push('## RAW HTML SNAPSHOT (Sanitized, No Scripts)')
    sections.push('')
    sections.push(renderHtmlSnapshotMarkdown(htmlSanitized, args.url))
    sections.push('')
  }

  return sections.join('\n')
}

export function convertWebpageHtmlToMarkdownArtifact(args: { html: string; url: string }): string {
  const url = safeText(args.url)
  const raw = String(args.html || '')
  const parser = new DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')

  const title = safeText(doc.title || '')
  const h1 = safeText((doc.querySelector('h1') as HTMLElement | null)?.innerText || '')
  const pageTitle = title || h1 || url
  const platform = extractPlatform(doc)

  const header = pickHeaderRoot(doc)
  const main = pickPrimaryContentRoot(doc)
  const footer = pickFooterRoot(doc)

  const skip = extractSkipLink(doc)
  const logos = extractLogoCandidates(header, url)
  const navMenus = extractNavMenus(header, url)
  const assets = extractAssets(doc, url)
  const mainSections = extractMainSections(main, url)

  const toc: Array<{ label: string; anchor: string; children?: Array<{ label: string; anchor: string }> }> = []
  if (skip) toc.push({ label: 'Accessibility Features', anchor: 'accessibility-features' })
  if (header) toc.push({ label: 'Navigation Header', anchor: 'navigation-header' })
  toc.push({ label: 'Page Header', anchor: 'page-header' })
  toc.push({
    label: 'Main Content',
    anchor: 'main-content',
    children: mainSections
      .slice(0, 96)
      .map((s) => ({ label: s.heading, anchor: slugify(s.heading) })),
  })
  if (footer) toc.push({ label: 'Footer', anchor: 'footer' })
  toc.push({ label: 'Asset Catalog', anchor: 'asset-catalog' })

  const out: string[] = []
  out.push(`# ${pageTitle}`)
  out.push('')
  out.push(`**URL:** ${url}  `)
  out.push(`**Scraped:** ${scrapeDate()}  `)
  if (platform) out.push(`**Platform:** ${platform}  `)
  out.push('**Fidelity Level:** 100% Source-Faithful (No Invented Content)')
  out.push('')
  out.push('---')
  out.push('')

  out.push('## 📋 TABLE OF CONTENTS')
  out.push('')
  let idx = 1
  for (const item of toc) {
    out.push(`${idx}. [${item.label}](#${item.anchor})`)
    if (item.children && item.children.length) {
      for (const child of item.children) out.push(`   - [${child.label}](#${child.anchor})`)
    }
    idx += 1
  }
  out.push('')
  out.push('---')
  out.push('')

  if (skip) {
    out.push('<a id="accessibility-features"></a>')
    out.push('## ♿ ACCESSIBILITY FEATURES')
    out.push('')
    out.push('```')
    out.push(`[${skip.text}](${skip.href})`)
    out.push('```')
    out.push('')
    out.push(`**Link Target:** ${skip.href}  `)
    out.push('**Purpose:** Keyboard accessibility')
    out.push('')
    out.push('---')
    out.push('')
  }

  if (header) {
    out.push('<a id="navigation-header"></a>')
    out.push('## 🧭 NAVIGATION HEADER')
    out.push('')
    out.push('### Page Structure')
    out.push('')

    const navLabels = navMenus
      .map((m) => stripTrailingPunctuation(normalizeInline(m.label)))
      .filter(Boolean)
      .slice(0, 6)
    const hasToggle = hasMenuToggleButton(header)
    const line = `  [LOGO]  ${navLabels.map((x) => `[${x}]`).join(' ')}${hasToggle ? '  [Toggle Menu]' : ''}`.trimEnd()
    out.push('```')
    out.push(renderSimpleBox([line], { width: 66 }))
    out.push('```')
    out.push('')

    if (logos.length) {
      out.push('### Logo')
      out.push('')
      const unique = logos.filter((l, i) => logos.findIndex((x) => x.imgUrl === l.imgUrl && x.href === l.href) === i)
      const primary = unique[0]
      if (primary) {
        out.push(`**Image URL:** ${primary.imgUrl}`)
        out.push('')
        if (primary.href) {
          out.push(`**Link:** [${primary.href}](${primary.href})`)
          out.push('')
        }
        if (primary.alt) {
          out.push(`**Alt Text:** ${primary.alt}`)
          out.push('')
        }
        if (unique.length > 1) out.push(`**Note:** Logo appears ${unique.length} times (distinct URLs or targets)`)
        out.push('')
      }
      out.push('---')
      out.push('')
    }

    if (navMenus.length) {
      out.push('### Primary Navigation')
      out.push('')
      const cols = navMenus.filter((m) => m.label).slice(0, 8)
      if (cols.length) {
        out.push(serializeMarkdownPipeTable({
          columns: cols.map((c) => `${stripTrailingPunctuation(normalizeInline(c.label))}${c.items?.length ? ' ▼' : ''}`),
          rows: [],
        }).join('\n'))
        out.push('')
      }
    }

    for (const menu of navMenus) {
      const items = menu.items || []
      if (!items.length) continue
      const titleText = stripTrailingPunctuation(normalizeInline(menu.label))
      if (!titleText) continue
      out.push(`#### ${titleText} Dropdown`)
      out.push('')
      const boxLines: string[] = []
      boxLines.push(`  ${titleText}`)
      boxLines.push('')
      for (const it of items.slice(0, 14)) {
        const label = stripTrailingPunctuation(normalizeInline(it.label))
        const href = formatRelativeHref(it.href, url)
        if (!label && !href) continue
        boxLines.push(`  • ${label}`.trimEnd())
        if (href) boxLines.push(`    ${href}`)
        boxLines.push('')
      }
      while (boxLines.length && !boxLines[boxLines.length - 1]?.trim()) boxLines.pop()
      out.push('```')
      out.push(renderAsciiFrame({ title: titleText, width: 62, lines: boxLines }))
      out.push('```')
      out.push('')
      const menuRows: string[][] = []
      for (const it of items.slice(0, 20)) {
        const label = stripTrailingPunctuation(normalizeInline(it.label))
        const href = it.href
        if (!label || !href) continue
        const rel = formatRelativeHref(href, url)
        menuRows.push([escapeTableCell(label), `[${escapeTableCell(rel)}](${href})`])
      }
      out.push(...serializeMarkdownPipeTable({ columns: ['Menu Item', 'Link'], rows: menuRows }))
      out.push('')
    }
    out.push('---')
    out.push('')
  }

  out.push('<a id="page-header"></a>')
  out.push('## 📄 PAGE HEADER')
  out.push('')
  out.push('### Page Title')
  out.push('')
  out.push('```')
  out.push(`## ${stripTrailingPunctuation(pageTitle)}`)
  out.push('```')
  out.push('')

  const heroImg = (() => {
    const og = safeText((doc.querySelector('meta[property="og:image"], meta[name="twitter:image"]') as HTMLElement | null)?.getAttribute('content') || '')
    if (og) return { url: resolveUrl(url, og), alt: '' }
    return pickHeroImage(main, header, url)
  })()
  if (heroImg) {
    out.push('### Header Image')
    out.push('')
    out.push(`**Image URL:** ${heroImg.url}`)
    out.push('')
    if (heroImg.alt) {
      out.push(`**Alt Text:** ${heroImg.alt}`)
      out.push('')
    }
  }
  out.push('---')
  out.push('')

  out.push('<a id="main-content"></a>')
  out.push('## 📖 MAIN CONTENT')
  out.push('')

  for (const s of mainSections) {
    const anchor = slugify(s.heading)
    out.push(`<a id="${anchor}"></a>`)
    out.push(`### ${s.heading}`)
    out.push('')
    const renderedBlocks = coalesceCardBlocksToMarkdownTable(s.blocks || [])
    for (const b of renderedBlocks) {
      out.push(b)
      out.push('')
    }
    out.push('---')
    out.push('')
  }

  if (footer) {
    out.push('<a id="footer"></a>')
    out.push('## 🔗 FOOTER')
    out.push('')
    const links = Array.from(footer.querySelectorAll('a')) as HTMLAnchorElement[]
    const rows: Array<{ text: string; href: string }> = []
    for (const a of links) {
      const text = safeText((a as HTMLElement).innerText || a.textContent || '')
      const href = safeText(a.getAttribute('href') || '')
      if (!text || !href) continue
      rows.push({ text, href })
      if (rows.length >= 24) break
    }
    if (rows.length) {
      out.push(...serializeMarkdownPipeTable({
        columns: ['Link Text', 'URL'],
        rows: rows.map(r => [escapeTableCell(r.text), r.href]),
      }))
      out.push('')
    }
    out.push('---')
    out.push('')
  }

  out.push('<a id="asset-catalog"></a>')
  out.push('## 🗂️ ASSET CATALOG')
  out.push('')

  const byKind = (k: AssetKind) => assets.filter((a) => a.kind === k)
  const kinds: AssetKind[] = ['image', 'video', 'audio', 'stylesheet', 'script', 'icon']
  out.push(...serializeMarkdownPipeTable({
    columns: ['Kind', 'Count'],
    alignments: [null, 'right'],
    rows: kinds.map(k => [k, byKind(k).length]),
  }))
  out.push('')

  const renderAssetTable = (k: AssetKind, title: string) => {
    const items = byKind(k)
    if (!items.length) return
    out.push(`### ${title}`)
    out.push('')
    out.push(...serializeMarkdownPipeTable({
      columns: ['#', 'URL', 'Label'],
      alignments: ['right', null, null],
      rows: items.slice(0, 120).map((it, index) => [index + 1, it.url, escapeTableCell(safeText(it.label || ''))]),
    }))
    out.push('')
  }
  renderAssetTable('image', 'Images')
  renderAssetTable('video', 'Videos')
  renderAssetTable('audio', 'Audio')
  renderAssetTable('stylesheet', 'Stylesheets')
  renderAssetTable('script', 'Scripts')
  renderAssetTable('icon', 'Icons')

  if (mainSections.length) {
    out.push('---')
    out.push('')
    out.push('## RAW CONTENT SNAPSHOT')
    out.push('')
    for (const s of mainSections) {
      const heading = String(s.heading || '').trim()
      if (heading) {
        const anchor = slugify(`raw-${heading}`)
        out.push(`<a id="${anchor}"></a>`)
        out.push(`### ${heading}`)
        out.push('')
      }
      const blocks = s.blocks || []
      for (const b of blocks) {
        const rawBlock = String(b || '').trim()
        if (!rawBlock) continue
        out.push(rawBlock)
        out.push('')
      }
    }
  }

  out.push('---')
  out.push('')
  out.push('## ✅ EXTRACTION COMPLETED')
  out.push('')
  out.push(`**Extraction Completed:** ${scrapeDateTime()}  `)
  out.push('')

  return out.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n'
}
