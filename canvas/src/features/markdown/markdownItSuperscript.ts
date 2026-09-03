import type MarkdownIt from 'markdown-it'

type MarkdownItToken = {
  markup?: string
}

type MarkdownItInlineState = {
  src: string
  pos: number
  posMax: number
  md: MarkdownIt & {
    inline: {
      tokenize: (state: MarkdownItInlineState) => void
    }
  }
  push: (type: string, tag: string, nesting: number) => MarkdownItToken
}

const CARET_CHAR_CODE = '^'.charCodeAt(0)
const SUPERSCRIPT_RULE_NAME = 'agentic_graph_superscript'

function isEscapedMarker(src: string, index: number): boolean {
  let backslashCount = 0
  for (let i = index - 1; i >= 0 && src.charCodeAt(i) === 0x5c; i -= 1) {
    backslashCount += 1
  }
  return backslashCount % 2 === 1
}

function findClosingCaret(src: string, from: number, to: number): number {
  for (let i = from; i < to; i += 1) {
    if (src.charCodeAt(i) === CARET_CHAR_CODE && !isEscapedMarker(src, i)) {
      return i
    }
  }
  return -1
}

function tokenizeSuperscript(state: MarkdownItInlineState, silent: boolean): boolean {
  const start = state.pos
  if (state.src.charCodeAt(start) !== CARET_CHAR_CODE || isEscapedMarker(state.src, start)) {
    return false
  }

  const contentStart = start + 1
  if (contentStart >= state.posMax) {
    return false
  }

  const contentEnd = findClosingCaret(state.src, contentStart, state.posMax)
  if (contentEnd <= contentStart) {
    return false
  }

  const content = state.src.slice(contentStart, contentEnd)
  if (/\s/.test(content)) {
    return false
  }

  if (silent) {
    state.pos = contentEnd + 1
    return true
  }

  const previousPosMax = state.posMax
  const open = state.push('sup_open', 'sup', 1)
  open.markup = '^'

  state.pos = contentStart
  state.posMax = contentEnd
  state.md.inline.tokenize(state)

  const close = state.push('sup_close', 'sup', -1)
  close.markup = '^'
  state.pos = contentEnd + 1
  state.posMax = previousPosMax
  return true
}

export function markdownItSuperscript(md: MarkdownIt): void {
  md.inline.ruler.after('emphasis', SUPERSCRIPT_RULE_NAME, tokenizeSuperscript)
}
