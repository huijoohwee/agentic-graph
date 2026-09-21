import type { InlineMediaKind } from '@/lib/command-menu/inlineCommandMenuCatalog'

export type FloatingPanelChatMediaToken = {
  index: number
  raw: string
  mediaKind: InlineMediaKind
  label: string
  sourceUrl?: string
  thumbnailUrl?: string
}

const MARKDOWN_IMAGE_RE = /!\[([^\]\r\n]{0,160})\]\s*\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^)]*["'])?\s*\)/gi
const HTML_MEDIA_RE = /<(audio|video)\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>(?:\s*<\/\1>)?/gi
const HTML_IMAGE_RE = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi

const cleanMediaUrl = (raw: string): string => String(raw || '').trim().replace(/^<|>$/g, '')

const readHtmlAttr = (raw: string, name: string): string => {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(raw)
  return String(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim()
}

const pushToken = (
  tokens: FloatingPanelChatMediaToken[],
  token: FloatingPanelChatMediaToken,
): void => {
  if (!token.raw || !token.sourceUrl) return
  tokens.push(token)
}

export function collectFloatingPanelChatMediaTokens(text: string): FloatingPanelChatMediaToken[] {
  const source = String(text || '')
  const tokens: FloatingPanelChatMediaToken[] = []
  for (const match of source.matchAll(MARKDOWN_IMAGE_RE)) {
    const url = cleanMediaUrl(match[2] || '')
    const label = String(match[1] || 'Image').trim() || 'Image'
    pushToken(tokens, {
      index: match.index || 0,
      raw: match[0],
      mediaKind: 'image',
      label,
      sourceUrl: url,
      thumbnailUrl: url,
    })
  }
  for (const match of source.matchAll(HTML_IMAGE_RE)) {
    const raw = match[0]
    const url = cleanMediaUrl(match[1] || match[2] || match[3] || '')
    const label = readHtmlAttr(raw, 'alt') || readHtmlAttr(raw, 'title') || 'Image'
    pushToken(tokens, {
      index: match.index || 0,
      raw,
      mediaKind: 'image',
      label,
      sourceUrl: url,
      thumbnailUrl: url,
    })
  }
  for (const match of source.matchAll(HTML_MEDIA_RE)) {
    const mediaKind = String(match[1] || '').toLowerCase() === 'audio' ? 'audio' : 'video'
    const raw = match[0]
    const sourceUrl = cleanMediaUrl(match[2] || match[3] || match[4] || '')
    const label = readHtmlAttr(raw, 'title') || (mediaKind === 'audio' ? 'Audio' : 'Video')
    const thumbnailUrl = mediaKind === 'video' ? readHtmlAttr(raw, 'poster') || undefined : undefined
    pushToken(tokens, {
      index: match.index || 0,
      raw,
      mediaKind,
      label,
      sourceUrl,
      thumbnailUrl,
    })
  }
  return tokens.sort((a, b) => a.index - b.index)
}

export const readFloatingPanelChatMediaPlaceholder = (token: FloatingPanelChatMediaToken): string => {
  if (token.mediaKind === 'image') return '[attached image]'
  if (token.mediaKind === 'audio') return '[attached audio]'
  return '[attached video]'
}
