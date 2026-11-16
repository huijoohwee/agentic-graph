import { convertHtmlToMarkdownUnified } from '@/lib/markdown/htmlToMarkdownUnified'

type InlineSlideDeckMarkdown = {
  title: string
  markdown: string
  slideCount: number
}

const INLINE_SLIDES_ASSIGNMENT_RE = /\b(?:const|let|var)\s+slides\s*=\s*\[/i

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

function stripLeadingSlideComments(html: string): string {
  return String(html || '').replace(/^\s*(?:<!--[\s\S]*?-->\s*)+/u, '').trim()
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
  return source.includes('<iframe') && INLINE_SLIDES_ASSIGNMENT_RE.test(source)
}

async function convertInlineSlideToMarkdown(args: {
  html: string
  url: string
  includeImages: boolean
  fidelityLevel: 1 | 2 | 3 | 4
}): Promise<{ title: string; markdown: string } | null> {
  const cleanedHtml = stripLeadingSlideComments(args.html)
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
  const slides = parseInlineSlideDeckItems(args.html)
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
