export type CardInlineTextExternalMediaCandidate = {
  kind: 'image' | 'audio' | 'video'
  url: string
  label: string
  thumbnailUrl?: string
  sourceKey?: string
}

export type CardInlineTextExternalCommandTarget = {
  id: string
  insertMedia: (candidate: CardInlineTextExternalMediaCandidate) => boolean
  insertText?: (replacement: string) => boolean
}

const CARD_INLINE_TEXT_EXTERNAL_COMMAND_STATE_KEY = '__agenticGraphCardInlineTextExternalCommandState'
const CARD_INLINE_TEXT_EXTERNAL_MEDIA_INSERT_EVENT = 'agentic-graph:card-inline-text:insert-media'

type CardInlineTextExternalCommandState = {
  activeTarget: CardInlineTextExternalCommandTarget | null
  targetByElement: WeakMap<Element, CardInlineTextExternalCommandTarget>
}

const readGlobalObject = (): (typeof globalThis & {
  [CARD_INLINE_TEXT_EXTERNAL_COMMAND_STATE_KEY]?: CardInlineTextExternalCommandState
}) | null => {
  try {
    return globalThis as typeof globalThis & {
      [CARD_INLINE_TEXT_EXTERNAL_COMMAND_STATE_KEY]?: CardInlineTextExternalCommandState
    }
  } catch {
    return null
  }
}

const readCommandState = (): CardInlineTextExternalCommandState => {
  const globalObject = readGlobalObject()
  if (!globalObject) return { activeTarget: null, targetByElement: new WeakMap() }
  if (!globalObject[CARD_INLINE_TEXT_EXTERNAL_COMMAND_STATE_KEY]) {
    globalObject[CARD_INLINE_TEXT_EXTERNAL_COMMAND_STATE_KEY] = { activeTarget: null, targetByElement: new WeakMap() }
  }
  const state = globalObject[CARD_INLINE_TEXT_EXTERNAL_COMMAND_STATE_KEY]
  if (!state.targetByElement) state.targetByElement = new WeakMap()
  return state
}

const normalizeText = (value: unknown): string => String(value || '').trim()

const escapeMarkdownAlt = (value: string): string =>
  value.replace(/[[\]\n\r]/g, ' ').trim()

const escapeAttribute = (value: string): string =>
  value.replace(/[\n\r<>]/g, ' ').replace(/"/g, '&quot;').trim()

export function buildCardInlineTextMediaEmbed(candidate: CardInlineTextExternalMediaCandidate): string {
  const url = normalizeText(candidate.url)
  const label = normalizeText(candidate.label || candidate.sourceKey)
  if (candidate.kind === 'image') {
    return `![${escapeMarkdownAlt(label || 'Image alt')}](${url || 'image-url'})`
  }
  const title = escapeAttribute(label)
  const titleAttr = title ? ` title="${title}"` : ''
  if (candidate.kind === 'audio') return `<audio src="${url || 'audio-url'}"${titleAttr} controls></audio>`
  const poster = normalizeText(candidate.thumbnailUrl)
  const posterAttr = poster ? ` poster="${escapeAttribute(poster)}"` : ''
  return `<video src="${url || 'video-url'}"${posterAttr}${titleAttr} controls></video>`
}

export function setActiveCardInlineTextExternalCommandTarget(target: CardInlineTextExternalCommandTarget | null): void {
  readCommandState().activeTarget = target
}

export function setCardInlineTextExternalCommandElementTarget(element: Element | null, target: CardInlineTextExternalCommandTarget | null): void {
  if (!element) return
  const targetByElement = readCommandState().targetByElement
  if (target) {
    targetByElement.set(element, target)
    return
  }
  targetByElement.delete(element)
}

export function clearActiveCardInlineTextExternalCommandTarget(id: string): void {
  const state = readCommandState()
  if (state.activeTarget?.id === id) state.activeTarget = null
}

const readSelectedCardInlineTextExternalCommandTarget = (): CardInlineTextExternalCommandTarget | null => {
  try {
    const ownerDocument = globalThis.document
    if (!ownerDocument) return null
    const selection = ownerDocument.getSelection?.()
    const anchor = selection?.anchorNode || selection?.focusNode || null
    if (!anchor) return null
    const startElement = anchor.nodeType === 1 ? anchor as Element : anchor.parentElement
    const field = startElement?.closest?.('[data-kg-card-inline-edit="1"]') || null
    if (!field) return null
    const selectedStoryboardCard = ownerDocument.querySelector('[data-kg-storyboard-widget-selected="1"]')
    if (selectedStoryboardCard && !selectedStoryboardCard.contains(field)) return null
    return readCommandState().targetByElement.get(field) || null
  } catch {
    return null
  }
}

const insertTextIntoSelectedStoryboardCard = (text: string): CardInlineTextExternalCommandTarget | null => {
  try {
    const ownerDocument = globalThis.document
    if (!ownerDocument) return null
    const fields = ownerDocument.querySelectorAll('[data-kg-storyboard-widget-selected="1"] [data-kg-card-inline-external-text-target="1"]')
    for (const field of fields) {
      let target = readCommandState().targetByElement.get(field)
      if (target?.insertText?.(text) === true) return target
      const clickableField = field as HTMLElement
      if (typeof clickableField.click !== 'function') continue
      clickableField.click()
      target = readCommandState().targetByElement.get(field)
      if (target?.insertText?.(text) === true) return target
    }
  } catch {
    return null
  }
  return null
}

export function insertMediaIntoActiveCardInlineTextEditor(candidate: CardInlineTextExternalMediaCandidate): boolean {
  const selectedTarget = readSelectedCardInlineTextExternalCommandTarget()
  if (selectedTarget?.insertMedia(candidate) === true) {
    setActiveCardInlineTextExternalCommandTarget(selectedTarget)
    return true
  }
  const activeTarget = readCommandState().activeTarget
  if (activeTarget?.insertMedia(candidate) === true) return true
  try {
    const event = new CustomEvent(CARD_INLINE_TEXT_EXTERNAL_MEDIA_INSERT_EVENT, {
      detail: candidate,
      bubbles: true,
      cancelable: true,
    })
    return globalThis.dispatchEvent(event) === false || event.defaultPrevented
  } catch {
    return false
  }
}

export function insertTextIntoActiveCardInlineTextEditor(replacement: string): boolean {
  const text = normalizeText(replacement)
  if (!text) return false
  const selectedTarget = readSelectedCardInlineTextExternalCommandTarget()
  if (selectedTarget?.insertText?.(text) === true) {
    setActiveCardInlineTextExternalCommandTarget(selectedTarget)
    return true
  }
  const selectedStoryboardTarget = insertTextIntoSelectedStoryboardCard(text)
  if (selectedStoryboardTarget) {
    setActiveCardInlineTextExternalCommandTarget(selectedStoryboardTarget)
    return true
  }
  const activeTarget = readCommandState().activeTarget
  if (activeTarget?.insertText?.(text) === true) return true
  return false
}
