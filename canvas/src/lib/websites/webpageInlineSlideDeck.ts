import { convertHtmlToMarkdownUnified } from '@/lib/markdown/htmlToMarkdownUnified'

type InlineSlideDeckMarkdown = {
  title: string
  markdown: string
  slideCount: number
}

const INLINE_SLIDES_ASSIGNMENT_RE = /\b(?:const|let|var)\s+slides\s*=\s*\[/i
const IFRAME_TAG_RE = /<iframe\b[\s\S]*?>/gi

function decodeInlineSlideHtmlEntities(value: string): string {
  let next = String(value || '')
  for (let pass = 0; pass < 2; pass += 1) {
    const decoded = next
      .replace(/&#x([0-9a-f]{1,6});?/gi, (_match, hex: string) => {
        try {
          return String.fromCodePoint(Number.parseInt(hex, 16))
        } catch {
          return _match
        }
      })
      .replace(/&#([0-9]{1,7});?/g, (_match, dec: string) => {
        try {
          return String.fromCodePoint(Number.parseInt(dec, 10))
        } catch {
          return _match
        }
      })
      .replace(/&nbsp;?/gi, ' ')
      .replace(/&quot;?/gi, '"')
      .replace(/&apos;?/gi, "'")
      .replace(/&lt;?/gi, '<')
      .replace(/&gt;?/gi, '>')
      .replace(/&amp;?/gi, '&')
    if (decoded === next) break
    next = decoded
  }
  return next.trim()
}

function extractHtmlTitle(html: string): string {
  const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return String(match?.[1] || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSlidesArrayLiteral(html: string): string | null {
  const source = String(html || '')
  const match = INLINE_SLIDES_ASSIGNMENT_RE.exec(source)
  if (!match) return null
  const openIndex = source.indexOf('[', match.index)
  if (openIndex < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index] || ''
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '[') {
      depth += 1
      continue
    }
    if (char !== ']') continue
    depth -= 1
    if (depth === 0) return source.slice(openIndex, index + 1)
  }
  return null
}

function parseInlineSlideDeckItems(html: string): string[] {
  const literal = extractSlidesArrayLiteral(html)
  if (!literal) return []
  try {
    const parsed = JSON.parse(literal) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(item => typeof item === 'string' ? item.trim() : '')
      .filter(Boolean)
  } catch {
    return []
  }
}

function readTagAttribute(tag: string, name: string): string {
  const escapedName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(tag || '').match(new RegExp(`\\b${escapedName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))
  return String(match?.[2] || '').trim()
}

function looksLikeInlineSlideIframe(tag: string, srcdocHtml: string): boolean {
  const decoded = String(srcdocHtml || '').trim()
  if (!decoded) return false
  if (/<!--\s*ai-slides:/i.test(decoded)) return true
  const title = readTagAttribute(tag, 'title').toLowerCase()
  if (title === 'presentation slide') return true
  const id = readTagAttribute(tag, 'id').toLowerCase()
  return id === 'slide' && /<(?:main|section|article|h1)\b/i.test(decoded)
}

function parseInlineSlideDeckSrcdocItems(html: string): string[] {
  const source = String(html || '')
  if (!source.includes('<iframe')) return []
  const slides: string[] = []
  for (const match of source.matchAll(IFRAME_TAG_RE)) {
    const tag = String(match[0] || '')
    const rawSrcdoc = readTagAttribute(tag, 'srcdoc')
    const decodedSrcdoc = decodeInlineSlideHtmlEntities(rawSrcdoc)
    if (!looksLikeInlineSlideIframe(tag, decodedSrcdoc)) continue
    slides.push(decodedSrcdoc)
  }
  return slides
}

function chooseInlineSlideDeckItems(html: string): string[] {
  const arraySlides = parseInlineSlideDeckItems(html)
  const iframeSlides = parseInlineSlideDeckSrcdocItems(html)
  if (iframeSlides.length === 0) return arraySlides
  if (arraySlides.length === 0) return iframeSlides
  if (iframeSlides.length > arraySlides.length) return iframeSlides
  if (iframeSlides.length < arraySlides.length) return arraySlides
  const iframeChars = iframeSlides.reduce((sum, slide) => sum + slide.length, 0)
  const arrayChars = arraySlides.reduce((sum, slide) => sum + slide.length, 0)
  return iframeChars >= arrayChars ? iframeSlides : arraySlides
}

function stripLeadingSlideComments(html: string): string {
  return String(html || '').replace(/^\s*(?:<!--[\s\S]*?-->\s*)+/u, '').trim()
}

function stripInlineSlideEditorBridge(html: string): string {
  return String(html || '')
    .replace(/<script\b[^>]*\bid\s*=\s*["']__qw_sel_bridge["'][^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*>\s*\/\*\s*ai-slides-present-keyforward-v\d+\s*\*\/[\s\S]*?<\/script\s*>/gi, '')
}

function firstMarkdownHeading(markdown: string): string {
  const match = String(markdown || '').match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/m)
  return String(match?.[1] || '').trim()
}

function stripMatchingLeadingHeading(markdown: string, heading: string): string {
  const text = String(markdown || '').trim()
  const normalizedHeading = String(heading || '').trim().toLowerCase()
  if (!text || !normalizedHeading) return text
  const lines = text.split('\n')
  const first = String(lines[0] || '').trim()
  const match = first.match(/^#{1,6}\s+(.+?)\s*$/)
  if (!match || String(match[1] || '').trim().toLowerCase() !== normalizedHeading) return text
  return lines.slice(1).join('\n').trim()
}

export function looksLikeInlineSlideDeckShell(html: string): boolean {
  const source = String(html || '')
  return INLINE_SLIDES_ASSIGNMENT_RE.test(source) || parseInlineSlideDeckSrcdocItems(source).length > 0
}

async function convertInlineSlideToMarkdown(args: {
  html: string
  url: string
  includeImages: boolean
  fidelityLevel: 1 | 2 | 3 | 4
}): Promise<{ title: string; markdown: string } | null> {
  const cleanedHtml = stripInlineSlideEditorBridge(stripLeadingSlideComments(args.html))
  if (!cleanedHtml) return null
  const converted = await convertHtmlToMarkdownUnified({
    html: cleanedHtml,
    baseUrl: args.url,
    includeImages: args.includeImages,
    fidelityLevel: args.fidelityLevel,
    includeHeadSection: false,
    injectTitleHeading: false,
  })
  const markdown = converted.ok === true ? String(converted.markdown || '').trim() : ''
  if (!markdown) return null
  const title = extractHtmlTitle(cleanedHtml) || firstMarkdownHeading(markdown)
  return { title, markdown }
}

export async function extractInlineSlideDeckMarkdown(args: {
  html: string
  url: string
  includeImages?: boolean
  fidelityLevel?: 1 | 2 | 3 | 4
}): Promise<InlineSlideDeckMarkdown | null> {
  if (!looksLikeInlineSlideDeckShell(args.html)) return null
  const slides = chooseInlineSlideDeckItems(args.html)
  if (slides.length === 0) return null

  const includeImages = args.includeImages !== false
  const fidelityLevel =
    args.fidelityLevel === 1 || args.fidelityLevel === 2 || args.fidelityLevel === 3 || args.fidelityLevel === 4
      ? args.fidelityLevel
      : 4

  const deckTitle = extractHtmlTitle(args.html)
  const sections: string[] = []
  if (deckTitle) sections.push(`# ${deckTitle}`)

  let slideCount = 0
  for (let index = 0; index < slides.length; index += 1) {
    const converted = await convertInlineSlideToMarkdown({
      html: slides[index] || '',
      url: args.url,
      includeImages,
      fidelityLevel,
    })
    if (!converted?.markdown) continue
    slideCount += 1
    const slideTitle = converted.title || `Slide ${index + 1}`
    const slideBody = stripMatchingLeadingHeading(converted.markdown, slideTitle)
    sections.push(`## Slide ${index + 1}: ${slideTitle}`)
    if (slideBody) sections.push(slideBody)
  }

  const markdown = sections.join('\n\n').trim()
  if (!markdown || slideCount === 0) return null
  return { title: deckTitle, markdown, slideCount }
}

export async function recoverInlineSlideDeckMarkdown(args: {
  html: string
  url: string
  includeImages?: boolean
  fidelityLevel?: 1 | 2 | 3 | 4
}): Promise<string> {
  const extracted = await extractInlineSlideDeckMarkdown(args)
  return String(extracted?.markdown || '').trim()
}
