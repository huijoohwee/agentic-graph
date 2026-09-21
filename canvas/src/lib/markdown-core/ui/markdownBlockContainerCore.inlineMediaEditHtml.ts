import {
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME,
  readCardMarkdownPreviewMediaLabel,
} from '@/lib/cards/cardMarkdownPreviewUtils'
import { INLINE_MEDIA_COMMAND_THUMBNAIL_ATTR, INLINE_MEDIA_COMMAND_THUMBNAIL_IMAGE_CLASS_NAME, readInlineMediaCommandThumbnailClassName } from '@/lib/command-menu/InlineMediaCommandThumbnail'
import { normalizeEscapedInlineMediaMarkdown } from '@/features/markdown/ui/inlineMediaMarkdown'
import {
  buildAgenticOsInvocationSourceTitle,
  findAgenticOsInvocationByToken,
} from '@/features/agentic-os/agenticOsDocInvocations'
import {
  readInlineKeywordChipLabel,
  resolveInlineInvocationChipClassName,
} from '@/features/markdown/ui/dataViewChipStyles'
import { normalizeRuntimeStorageMediaAccessUrl } from '@/lib/storage/runtimeMediaUrl'
import {
  AGENTIC_OS_INVOCATION_CHIP_ATTR,
  AGENTIC_OS_INVOCATION_TOKEN_ATTR,
} from '@/features/agentic-os/agenticOsInvocationChips'
import { splitInvocationTokenSegments } from '@/lib/markdown/invocationTokens'
import { UI_INLINE_CHIP_LABEL_15CH_CLASSNAME, UI_TEXT_TRUNCATE_CHIP } from '@/lib/ui/textLayout'

const INLINE_MEDIA_EDIT_TOKEN_ATTR = 'data-kg-inline-media-edit-token'
const INLINE_MEDIA_EDIT_MARKDOWN_ATTR = 'data-kg-inline-media-markdown'
const INLINE_INVOCATION_EDIT_TOKEN_ATTR = 'data-kg-inline-invocation-edit-token'
const INLINE_INVOCATION_EDIT_MARKDOWN_ATTR = 'data-kg-inline-invocation-markdown'
export const INLINE_MARKDOWN_ZERO_LENGTH_TOKEN_ATTR = 'data-kg-inline-markdown-zero-length-token'

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const escapeHtmlAttr = (value: unknown): string =>
  escapeHtml(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const escapeMarkdownAlt = (value: unknown): string =>
  String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/]/g, '\\]')
    .trim()

const readMediaMarkdown = (kind: 'image' | 'audio' | 'video', src: string, alt: string): string => {
  const safeAlt = escapeMarkdownAlt(alt || kind)
  return kind === 'image'
    ? `![${safeAlt}](${src})`
    : `![${kind === 'audio' ? 'Audio' : 'Video'}: ${safeAlt}](${src})`
}

const buildInlineMediaEditTokenHtml = (args: {
  kind: 'image' | 'audio' | 'video'
  src: string
  alt: string
  title: string
}): string => {
  const label = readCardMarkdownPreviewMediaLabel(args.alt || args.title, args.kind === 'audio' ? 'Audio' : args.kind === 'video' ? 'Video' : 'Image')
  const markdown = readMediaMarkdown(args.kind, args.src, args.alt || args.title || label)
  const thumbnailUrl = args.kind === 'image'
    ? normalizeRuntimeStorageMediaAccessUrl({ url: args.src })
    : ''
  const hasThumbnail = Boolean(thumbnailUrl)
  const thumbnailClassName = readInlineMediaCommandThumbnailClassName({ hasThumbnail, kind: args.kind, variant: 'inline' })
  const thumbnailBody = hasThumbnail
    ? `<img src="${escapeHtmlAttr(thumbnailUrl)}" alt="" class="${escapeHtmlAttr(INLINE_MEDIA_COMMAND_THUMBNAIL_IMAGE_CLASS_NAME)}" loading="lazy" decoding="async" draggable="false">`
    : ''
  return [
    `<span class="${escapeHtmlAttr(`${CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME} isolate !overflow-visible`)}"`,
    ` title="${escapeHtmlAttr(label)}"`,
    ' data-kg-card-inline-media-pill="1"',
    ` ${INLINE_MEDIA_EDIT_TOKEN_ATTR}="1"`,
    ` ${INLINE_MEDIA_EDIT_MARKDOWN_ATTR}="${escapeHtmlAttr(markdown)}"`,
    ' contenteditable="false">',
    `<span class="${escapeHtmlAttr(thumbnailClassName)}" aria-label="${escapeHtmlAttr(label)}" ${INLINE_MEDIA_COMMAND_THUMBNAIL_ATTR}="${escapeHtmlAttr(args.kind)}" role="img">${thumbnailBody}</span>`,
    `<span class="${escapeHtmlAttr(CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME)}">${escapeHtml(label)}</span>`,
    '</span>',
  ].join('')
}

const readRenderedMediaPillMarkdown = (node: HTMLElement): string => {
  const sourceValue = String(node.getAttribute('data-kg-card-inline-media-value') || '').trim()
  if (/^!\[[\s\S]*\]\([\s\S]+\)$/.test(sourceValue)) return sourceValue
  const href = String((node as HTMLAnchorElement).href || node.getAttribute('href') || '').trim()
  const src = sourceValue || href || String(node.getAttribute('data-kg-card-inline-media-token') || '').trim()
  if (!src || src.startsWith('#')) return ''
  const kind = /\.(?:mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(src)
    ? 'video'
    : /\.(?:mp3|wav|m4a|aac|ogg)(?:[?#].*)?$/i.test(src)
      ? 'audio'
      : 'image'
  const labelNode = node.querySelector(`.${CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME.split(/\s+/)[0]}`)
  const label = readCardMarkdownPreviewMediaLabel(
    String(labelNode?.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || '').trim(),
    kind === 'audio' ? 'Audio' : kind === 'video' ? 'Video' : 'Image',
  )
  return readMediaMarkdown(kind, src, label)
}

const buildInlineInvocationEditTokenHtml = (token: string): string => {
  const invocation = findAgenticOsInvocationByToken(token)
  const className = resolveInlineInvocationChipClassName({ value: token })
  return [
    `<span class="${escapeHtmlAttr(className)}"`,
    ` title="${escapeHtmlAttr(invocation ? buildAgenticOsInvocationSourceTitle(invocation) : token)}"`,
    ` ${INLINE_INVOCATION_EDIT_TOKEN_ATTR}="1"`,
    ` ${INLINE_INVOCATION_EDIT_MARKDOWN_ATTR}="${escapeHtmlAttr(token)}"`,
    ' contenteditable="false">',
    `<span class="${escapeHtmlAttr(`${UI_TEXT_TRUNCATE_CHIP} ${UI_INLINE_CHIP_LABEL_15CH_CLASSNAME}`)}">${escapeHtml(readInlineKeywordChipLabel(token))}</span>`,
    '</span>',
  ].join('')
}

const buildInlineSourceBindingEditTokenHtml = (args: { label: string; markdown: string; source: string }): string => {
  const token = `@${args.label}`
  const className = resolveInlineInvocationChipClassName({ value: token })
  return [
    `<span class="${escapeHtmlAttr(className)}" title="${escapeHtmlAttr(`${token}\nSource: ${args.source}`)}"`,
    ` ${INLINE_INVOCATION_EDIT_TOKEN_ATTR}="1" ${INLINE_INVOCATION_EDIT_MARKDOWN_ATTR}="${escapeHtmlAttr(args.markdown)}"`,
    ' data-kg-inline-source-binding-edit-token="1" contenteditable="false">',
    `<span class="${escapeHtmlAttr(`${UI_TEXT_TRUNCATE_CHIP} ${UI_INLINE_CHIP_LABEL_15CH_CLASSNAME}`)}">${escapeHtml(token)}</span>`,
    '</span>',
  ].join('')
}

const rewriteMarkdownSourceLinksForEditor = (root: HTMLElement): void => {
  const links = Array.from(root.querySelectorAll('a[href]')) as HTMLAnchorElement[]
  links.forEach(link => {
    const label = String(link.textContent || '').trim()
    const renderedSource = String(link.getAttribute('href') || '').trim()
    const source = renderedSource.startsWith('workspace:') ? decodeURI(renderedSource) : renderedSource
    if (!label.toLowerCase().endsWith('.md') || !source) return
    const prefix = link.previousSibling
    const hasAtPrefix = prefix?.nodeType === 3 && String(prefix.nodeValue || '').endsWith('@')
    if (hasAtPrefix && prefix) prefix.nodeValue = String(prefix.nodeValue || '').slice(0, -1)
    const markdown = `${hasAtPrefix ? '@' : ''}[${label}](${source})`
    const wrapper = root.ownerDocument.createElement('span')
    wrapper.innerHTML = buildInlineSourceBindingEditTokenHtml({ label, markdown, source })
    const token = wrapper.firstElementChild
    if (token) link.replaceWith(token)
  })
}

const rewriteRenderedInvocationChipsForEditor = (root: HTMLElement): void => {
  const selector = `[${AGENTIC_OS_INVOCATION_CHIP_ATTR}="1"][${AGENTIC_OS_INVOCATION_TOKEN_ATTR}]`
  const nodes = Array.from(root.querySelectorAll(selector)) as HTMLElement[]
  nodes.forEach(node => {
    const token = String(node.getAttribute(AGENTIC_OS_INVOCATION_TOKEN_ATTR) || '').trim()
    if (!findAgenticOsInvocationByToken(token)) return
    const wrapper = root.ownerDocument.createElement('span')
    wrapper.innerHTML = buildInlineInvocationEditTokenHtml(token)
    const editToken = wrapper.firstElementChild
    if (editToken) node.replaceWith(editToken)
  })
}

const rewriteTextNodeInvocationsForEditor = (root: HTMLElement): void => {
  const ownerDocument = root.ownerDocument
  const nodeFilterShowText = ownerDocument.defaultView?.NodeFilter?.SHOW_TEXT ?? 4
  const walker = ownerDocument.createTreeWalker(root, nodeFilterShowText)
  const textNodes: Text[] = []
  let node = walker.nextNode()
  while (node) {
    const parent = (node as Text).parentElement
    if (
      !parent?.closest(
        `code,pre,${INLINE_MARKDOWN_EDIT_TOKEN_SELECTOR},[${INLINE_MARKDOWN_ZERO_LENGTH_TOKEN_ATTR}="1"],[data-kg-inline-code-token="1"]`,
      )
    ) textNodes.push(node as Text)
    node = walker.nextNode()
  }
  textNodes.forEach(textNode => {
    const text = String(textNode.nodeValue || '')
    const segments = splitInvocationTokenSegments(text)
    if (!segments.some(segment => segment.kind === 'token')) return
    const fragment = ownerDocument.createDocumentFragment()
    segments.forEach(segment => {
      if (segment.kind === 'text') {
        fragment.append(ownerDocument.createTextNode(segment.value))
        return
      }
      const token = segment.value
      const wrapper = ownerDocument.createElement('span')
      wrapper.innerHTML = buildInlineInvocationEditTokenHtml(token)
      const tokenNode = wrapper.firstElementChild
      if (tokenNode) fragment.append(tokenNode)
      else fragment.append(ownerDocument.createTextNode(token))
    })
    textNode.replaceWith(fragment)
  })
}

const rewriteSemanticInlineCodeTokensForEditor = (root: HTMLElement): void => {
  const tokens = Array.from(root.querySelectorAll('[data-kg-inline-code-token="1"]')) as HTMLElement[]
  tokens.forEach(token => {
    const raw = String(token.getAttribute('data-kg-inline-code-raw') || '').replace(/\r/g, '').trim()
    if (!raw) return
    token.replaceChildren(root.ownerDocument.createTextNode(raw))
  })
}

export const rewriteRenderedInlineMediaForEditorHtml = (html: string): string => {
  const raw = String(html || '')
  if (!raw.trim() || typeof DOMParser === 'undefined') return raw
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(`<section>${raw}</section>`, 'text/html')
  } catch {
    return raw
  }
  const root = doc.body.firstElementChild as HTMLElement | null
  if (!root) return raw
  const renderedMediaPills = Array.from(root.querySelectorAll('[data-kg-card-inline-media-pill="1"]')) as HTMLElement[]
  renderedMediaPills.forEach(node => {
    if (node.hasAttribute(INLINE_MEDIA_EDIT_TOKEN_ATTR)) return
    const markdown = readRenderedMediaPillMarkdown(node)
    if (!markdown) return
    const normalized = normalizeEscapedInlineMediaMarkdown(markdown)
    const match = /^!\[([\s\S]*?)\]\(([\s\S]+)\)$/.exec(normalized)
    if (!match) return
    const url = String(match[2] || '').trim()
    const alt = String(match[1] || '').trim()
    const kind = /^(?:Audio|Video):\s/i.test(alt)
      ? /^Audio:\s/i.test(alt) ? 'audio' : 'video'
      : /\.(?:mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(url)
        ? 'video'
        : /\.(?:mp3|wav|m4a|aac|ogg)(?:[?#].*)?$/i.test(url)
          ? 'audio'
          : 'image'
    const wrapper = doc.createElement('span')
    wrapper.innerHTML = buildInlineMediaEditTokenHtml({ kind, src: url, alt, title: alt })
    const token = wrapper.firstElementChild
    if (token) node.replaceWith(token)
  })
  rewriteRenderedInvocationChipsForEditor(root)
  rewriteMarkdownSourceLinksForEditor(root)
  rewriteSemanticInlineCodeTokensForEditor(root)
  const mediaNodes = Array.from(root.querySelectorAll('img,video,audio')) as HTMLElement[]
  mediaNodes.forEach(node => {
    const tag = String(node.tagName || '').toLowerCase()
    const kind = tag === 'audio' ? 'audio' : tag === 'video' ? 'video' : 'image'
    const src = String(node.getAttribute('src') || '').trim()
    if (!src) return
    const alt = String(node.getAttribute('alt') || node.getAttribute('aria-label') || node.getAttribute('title') || '').trim()
    const title = String(node.getAttribute('title') || alt || '').trim()
    const wrapper = doc.createElement('span')
    wrapper.innerHTML = buildInlineMediaEditTokenHtml({ kind, src, alt, title })
    const token = wrapper.firstElementChild
    if (token) node.replaceWith(token)
  })
  rewriteTextNodeInvocationsForEditor(root)
  return root.innerHTML
}

// Keep the mounted Viewer presentation; annotate only atomic references for round-trip serialization.
export const prepareRenderedParagraphEditHtml = (html: string): string => {
  const root = new DOMParser().parseFromString(`<section>${html}</section>`, 'text/html').body.firstElementChild as HTMLElement
  root.querySelectorAll('[data-kg-variable-invocation],[data-kg-var-raw]').forEach(node => {
    const raw = node.getAttribute('data-kg-var-raw')
    if (!raw) return
    const token = root.ownerDocument.createElement('span')
    token.className = node.className
    token.innerHTML = node.innerHTML
    token.setAttribute(INLINE_INVOCATION_EDIT_TOKEN_ATTR, '1')
    token.setAttribute(INLINE_INVOCATION_EDIT_MARKDOWN_ATTR, raw)
    token.setAttribute('contenteditable', 'false')
    node.replaceWith(token)
  })
  return root.innerHTML
}

export const restoreInlineMediaEditTokensInPlace = (root: HTMLElement): void => {
  const tokens = Array.from(root.querySelectorAll(`[${INLINE_MEDIA_EDIT_TOKEN_ATTR}="1"]`)) as HTMLElement[]
  tokens.forEach(token => {
    const markdown = String(token.getAttribute(INLINE_MEDIA_EDIT_MARKDOWN_ATTR) || '').trim()
    if (!markdown) return
    token.replaceWith(root.ownerDocument.createTextNode(markdown))
  })
  const invocationTokens = Array.from(root.querySelectorAll(`[${INLINE_INVOCATION_EDIT_TOKEN_ATTR}="1"]`)) as HTMLElement[]
  invocationTokens.forEach(token => {
    const markdown = String(token.getAttribute(INLINE_INVOCATION_EDIT_MARKDOWN_ATTR) || token.textContent || '').trim()
    if (!markdown) return
    token.replaceWith(root.ownerDocument.createTextNode(markdown))
  })
  const semanticCodeTokens = Array.from(root.querySelectorAll('[data-kg-inline-code-token="1"]')) as HTMLElement[]
  semanticCodeTokens.forEach(token => {
    const raw = String(token.getAttribute('data-kg-inline-code-raw') || token.textContent || '').replace(/\r/g, '').trim()
    if (!raw) return
    const code = root.ownerDocument.createElement('code')
    code.textContent = raw
    token.replaceWith(code)
  })
}

export const INLINE_MEDIA_EDIT_TOKEN_SELECTOR = `[${INLINE_MEDIA_EDIT_TOKEN_ATTR}="1"]`
export const INLINE_MARKDOWN_EDIT_TOKEN_SELECTOR = `${INLINE_MEDIA_EDIT_TOKEN_SELECTOR},[${INLINE_INVOCATION_EDIT_TOKEN_ATTR}="1"]`
export const INLINE_MARKDOWN_ZERO_LENGTH_TOKEN_SELECTOR = `[${INLINE_MARKDOWN_ZERO_LENGTH_TOKEN_ATTR}="1"]`

const readInlineMediaEditTokenMarkdown = (token: Element): string =>
  normalizeEscapedInlineMediaMarkdown(String(token.getAttribute(INLINE_MEDIA_EDIT_MARKDOWN_ATTR) || token.textContent || '').replace(/\r/g, ''))

const readInlineInvocationEditTokenMarkdown = (token: Element): string =>
  String(token.getAttribute(INLINE_INVOCATION_EDIT_MARKDOWN_ATTR) || token.textContent || '').replace(/\r/g, '').trim()

const readInlineMediaNodeTypeConstants = (node: Node | null | undefined): { element: number; text: number } => {
  const ownerNode = node?.ownerDocument?.defaultView?.Node
  const globalNode = typeof Node !== 'undefined' ? Node : null
  return {
    element: ownerNode?.ELEMENT_NODE ?? globalNode?.ELEMENT_NODE ?? 1,
    text: ownerNode?.TEXT_NODE ?? globalNode?.TEXT_NODE ?? 3,
  }
}

const isElementNodeType = (node: Node | null | undefined): boolean =>
  !!node && node.nodeType === readInlineMediaNodeTypeConstants(node).element

const isTextNodeType = (node: Node | null | undefined): boolean =>
  !!node && node.nodeType === readInlineMediaNodeTypeConstants(node).text

const isInlineMediaEditTokenElement = (node: Node): node is HTMLElement =>
  isElementNodeType(node)
    && (node as Element).matches(INLINE_MEDIA_EDIT_TOKEN_SELECTOR)

const isInlineInvocationEditTokenElement = (node: Node): node is HTMLElement =>
  isElementNodeType(node)
    && (node as Element).matches(`[${INLINE_INVOCATION_EDIT_TOKEN_ATTR}="1"]`)

const isInlineMarkdownEditTokenElement = (node: Node): node is HTMLElement =>
  isInlineMediaEditTokenElement(node) || isInlineInvocationEditTokenElement(node)

const isInlineMarkdownZeroLengthTokenElement = (node: Node): node is HTMLElement =>
  isElementNodeType(node)
    && (node as Element).matches(INLINE_MARKDOWN_ZERO_LENGTH_TOKEN_SELECTOR)

export const readInlineMarkdownEditTokenMarkdown = (node: Element): string =>
  isInlineMediaEditTokenElement(node)
    ? readInlineMediaEditTokenMarkdown(node)
    : readInlineInvocationEditTokenMarkdown(node)

const readSerializedInlineMediaLength = (node: Node): number => {
  if (isInlineMarkdownZeroLengthTokenElement(node)) return 0
  if (isInlineMarkdownEditTokenElement(node)) return readInlineMarkdownEditTokenMarkdown(node).length
  if (isTextNodeType(node)) return String(node.nodeValue || '').replace(/\r/g, '').length
  if (!isElementNodeType(node)) return 0
  const element = node as HTMLElement
  if (String(element.tagName || '').toLowerCase() === 'br') return 1
  let length = 0
  Array.from(element.childNodes).forEach(child => {
    length += readSerializedInlineMediaLength(child)
  })
  const tag = String(element.tagName || '').toLowerCase()
  if (tag === 'div' || tag === 'p' || tag === 'pre') length += 1
  return length
}

export const readInlineMediaEditorMarkdownText = (root: HTMLElement | null): string => {
  if (!root) return ''
  let out = ''
  const walk = (node: Node): void => {
    if (isInlineMarkdownZeroLengthTokenElement(node)) return
    if (isInlineMarkdownEditTokenElement(node)) {
      out += readInlineMarkdownEditTokenMarkdown(node)
      return
    }
    if (isTextNodeType(node)) {
      out += String(node.nodeValue || '').replace(/\r/g, '')
      return
    }
    if (!isElementNodeType(node)) return
    const element = node as HTMLElement
    const tag = String(element.tagName || '').toLowerCase()
    if (tag === 'br') {
      out += '\n'
      return
    }
    Array.from(element.childNodes).forEach(walk)
    if (tag === 'div' || tag === 'p' || tag === 'pre') out += '\n'
  }
  Array.from(root.childNodes).forEach(walk)
  return out.endsWith('\n') ? out.slice(0, -1) : out
}

const readSerializedOffsetToBoundary = (
  root: HTMLElement,
  container: Node,
  offset: number,
): number | null => {
  const computeWithin = (parent: Node, baseOffset: number): number | null => {
    if (parent === container && isTextNodeType(parent)) {
      return baseOffset + Math.max(0, Math.min(offset, String(parent.nodeValue || '').length))
    }
    if (isInlineMarkdownEditTokenElement(parent)) {
      if (parent === container || parent.contains(container)) {
        return baseOffset + (offset > 0 ? readInlineMarkdownEditTokenMarkdown(parent).length : 0)
      }
      return null
    }
    if (isInlineMarkdownZeroLengthTokenElement(parent)) {
      if (parent === container || parent.contains(container)) return baseOffset
      return null
    }
    const children = Array.from(parent.childNodes)
    let current = baseOffset
    for (let index = 0; index <= children.length; index += 1) {
      if (parent === container && offset === index) return current
      if (index >= children.length) break
      const child = children[index]!
      if (child === container && isTextNodeType(child)) {
        return current + Math.max(0, Math.min(offset, String(child.nodeValue || '').length))
      }
      if (isInlineMarkdownEditTokenElement(child)) {
        if (child === container || child.contains(container)) {
          return current + (offset > 0 ? readInlineMarkdownEditTokenMarkdown(child).length : 0)
        }
        current += readInlineMarkdownEditTokenMarkdown(child).length
        continue
      }
      if (isInlineMarkdownZeroLengthTokenElement(child)) {
        if (child === container || child.contains(container)) return current
        continue
      }
      if (isElementNodeType(child) && (child as Element).contains(container)) {
        const nested = computeWithin(child, current)
        if (nested != null) return nested
      }
      current += readSerializedInlineMediaLength(child)
    }
    return null
  }
  return computeWithin(root, 0)
}

export const getInlineMediaEditorMarkdownSelectionOffsets = (
  root: HTMLElement | null,
): { startOffset: number; endOffset: number } | null => {
  if (!root) return null
  const ownerWindow = root.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null)
  const ownerNode = ownerWindow?.Node
  const elementNodeType = ownerNode?.ELEMENT_NODE ?? 1
  const selection = ownerWindow?.getSelection ? ownerWindow.getSelection() : null
  if (!selection || selection.rangeCount <= 0) return null
  const range = selection.getRangeAt(0)
  const startNode = range.startContainer
  const endNode = range.endContainer
  const startElement = startNode.nodeType === elementNodeType ? startNode as Element : startNode.parentElement
  const endElement = endNode.nodeType === elementNodeType ? endNode as Element : endNode.parentElement
  if (!startElement || !endElement || !root.contains(startElement) || !root.contains(endElement)) return null
  const startOffset = readSerializedOffsetToBoundary(root, startNode, range.startOffset)
  const endOffset = readSerializedOffsetToBoundary(root, endNode, range.endOffset)
  if (startOffset == null || endOffset == null) return null
  return {
    startOffset: Math.max(0, startOffset),
    endOffset: Math.max(0, endOffset),
  }
}

type InlineMediaOffsetSegment = {
  visibleStart: number
  visibleEnd: number
  markdownStart: number
  markdownEnd: number
  token: boolean
}

const readInlineMediaOffsetSegments = (root: HTMLElement): InlineMediaOffsetSegment[] => {
  const segments: InlineMediaOffsetSegment[] = []
  let visibleOffset = 0
  let markdownOffset = 0
  const push = (visibleLength: number, markdownLength: number, token: boolean) => {
    segments.push({
      visibleStart: visibleOffset,
      visibleEnd: visibleOffset + visibleLength,
      markdownStart: markdownOffset,
      markdownEnd: markdownOffset + markdownLength,
      token,
    })
    visibleOffset += visibleLength
    markdownOffset += markdownLength
  }
  const walk = (node: Node): void => {
    if (isInlineMarkdownZeroLengthTokenElement(node)) {
      push(String(node.textContent || '').replace(/\r/g, '').length, 0, true)
      return
    }
    if (isInlineMarkdownEditTokenElement(node)) {
      push(String(node.textContent || '').replace(/\r/g, '').length, readInlineMarkdownEditTokenMarkdown(node).length, true)
      return
    }
    if (isTextNodeType(node)) {
      const length = String(node.nodeValue || '').replace(/\r/g, '').length
      push(length, length, false)
      return
    }
    if (!isElementNodeType(node)) return
    const element = node as HTMLElement
    const tag = String(element.tagName || '').toLowerCase()
    if (tag === 'br') {
      push(1, 1, false)
      return
    }
    Array.from(element.childNodes).forEach(walk)
    if (tag === 'div' || tag === 'p' || tag === 'pre') push(1, 1, false)
  }
  Array.from(root.childNodes).forEach(walk)
  return segments
}

const mapVisibleOffsetToMarkdownOffset = (segments: InlineMediaOffsetSegment[], rawOffset: number): number => {
  const offset = Math.max(0, rawOffset)
  for (const segment of segments) {
    if (offset < segment.visibleStart) return segment.markdownStart
    if (offset > segment.visibleEnd) continue
    if (segment.token) {
      return offset <= segment.visibleStart ? segment.markdownStart : segment.markdownEnd
    }
    return segment.markdownStart + Math.max(0, Math.min(offset - segment.visibleStart, segment.markdownEnd - segment.markdownStart))
  }
  const last = segments[segments.length - 1]
  return last ? last.markdownEnd : offset
}

export const mapInlineMediaEditorVisibleOffsetsToMarkdownOffsets = (
  root: HTMLElement | null,
  offsets: { startOffset: number; endOffset: number } | null | undefined,
): { startOffset: number; endOffset: number } | null => {
  if (!root || !offsets || !root.querySelector(INLINE_MARKDOWN_EDIT_TOKEN_SELECTOR)) return offsets || null
  const segments = readInlineMediaOffsetSegments(root)
  return {
    startOffset: mapVisibleOffsetToMarkdownOffset(segments, offsets.startOffset),
    endOffset: mapVisibleOffsetToMarkdownOffset(segments, offsets.endOffset),
  }
}
