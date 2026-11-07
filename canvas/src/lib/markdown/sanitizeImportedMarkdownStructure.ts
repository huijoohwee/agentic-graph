type SanitizeResult = { text: string; changed: boolean }

const isMarkdownImage = (line: string): boolean => /^!\[[^\]\n]*\]\([^)]+\)$/.test(String(line || '').trim())

const isIgnorableShellText = (text: string): boolean => {
  const compact = String(text || '').replace(/\s+/g, '')
  if (!compact) return true
  return /^[*_\\※▼◆◇•·・—\-=|/]+$/.test(compact)
}

const trimMarkdownShell = (text: string): string => {
  let next = String(text || '').replace(/\s+/g, ' ').trim()
  next = next.replace(/\\+$/g, '').trim()
  next = next.replace(/^(\*{2,}|_{2,})\s*/g, '').replace(/\s*(\*{2,}|_{2,})$/g, '').trim()
  return next
}

export const normalizeMarkdownImageProseAdjacency = (text: string): SanitizeResult => {
  const raw = String(text || '')
  if (!/!\[[^\]\n]*\]\([^)]+\)/.test(raw)) return { text: raw, changed: false }
  const lines = raw.split(/\r?\n/g)
  let inFence = false
  let fence = ''
  let changed = false
  const out: string[] = []
  const imageRe = /!\[[^\]\n]*\]\([^)]+\)/g

  const pushPart = (value: string) => {
    const next = trimMarkdownShell(value)
    if (!next || isIgnorableShellText(next)) return
    if (out[out.length - 1] === next) return
    out.push(next)
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const mFence = trimmed.match(/^(```+|~~~+)(.*)$/)
    if (mFence) {
      if (!inFence) {
        inFence = true
        fence = mFence[1] || '```'
      } else if (trimmed.startsWith(fence)) {
        inFence = false
        fence = ''
      }
      out.push(line)
      continue
    }
    if (inFence || !imageRe.test(line)) {
      out.push(line)
      imageRe.lastIndex = 0
      continue
    }
    imageRe.lastIndex = 0
    const matches = Array.from(line.matchAll(imageRe))
    if (matches.length === 0) {
      out.push(line)
      continue
    }
    const outside = line.replace(imageRe, '')
    const hasTextOutside = !isIgnorableShellText(trimMarkdownShell(outside))
    const hasShellWrappedImage = /^\s*[*_]{2,}\s*!\[[^\]\n]*\]\([^)]+\)\s*[*_]{2,}\s*$/.test(line)
    if (!hasTextOutside && !hasShellWrappedImage) {
      out.push(line)
      continue
    }
    let last = 0
    for (const match of matches) {
      const index = match.index ?? 0
      pushPart(line.slice(last, index))
      if (out[out.length - 1] !== '') out.push('')
      pushPart(match[0] || '')
      if (out[out.length - 1] !== '') out.push('')
      last = index + String(match[0] || '').length
    }
    pushPart(line.slice(last))
    if (out[out.length - 1] === '') out.pop()
    changed = true
  }
  return { text: changed ? out.join('\n') : raw, changed }
}

export const normalizeLeadingStrongTitleToH1 = (text: string): SanitizeResult => {
  const lines = String(text || '').split(/\r?\n/g)
  let start = 0
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i]?.trim() === '---') {
        start = i + 1
        break
      }
    }
  }
  if (lines.slice(start, Math.min(lines.length, start + 24)).some(line => /^#\s+\S/.test(line.trim()))) {
    return { text, changed: false }
  }

  let first = start
  while (first < lines.length) {
    const trimmed = (lines[first] || '').trim()
    if (!trimmed || isMarkdownImage(trimmed)) {
      first += 1
      continue
    }
    break
  }

  const parts: string[] = []
  let last = first - 1
  let cursor = first
  while (cursor < lines.length && parts.length < 3) {
    const trimmed = (lines[cursor] || '').trim()
    if (!trimmed) {
      cursor += 1
      continue
    }
    const m = trimmed.match(/^\*\*([^*\n]{2,80})\*\*$/)
    if (!m) break
    parts.push((m[1] || '').replace(/\s+/g, ' ').trim())
    last = cursor
    cursor += 1
  }
  if (parts.length === 0 || last < first) return { text, changed: false }
  const out = lines.slice(0, first)
  out.push(`# ${parts.join(' ')}`)
  out.push(...lines.slice(last + 1))
  return { text: out.join('\n'), changed: true }
}

export const normalizeVerticalCjkHeadingRuns = (text: string): SanitizeResult => {
  const lines = String(text || '').split(/\r?\n/g)
  let inFence = false
  let fence = ''
  let changed = false
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()
    const mFence = trimmed.match(/^(```+|~~~+)(.*)$/)
    if (mFence) {
      if (!inFence) {
        inFence = true
        fence = mFence[1] || '```'
      } else if (trimmed.startsWith(fence)) {
        inFence = false
        fence = ''
      }
      out.push(line)
      continue
    }
    if (inFence || !/^\p{Script=Han}$/u.test(trimmed)) {
      out.push(line)
      continue
    }
    const chars: string[] = []
    let end = i
    while (end < lines.length && chars.length < 8) {
      const current = (lines[end] || '').trim()
      if (!current) {
        end += 1
        continue
      }
      if (!/^\p{Script=Han}$/u.test(current)) break
      chars.push(current)
      end += 1
    }
    if (chars.length < 2) {
      out.push(line)
      continue
    }
    out.push(`## ${chars.join('')}`)
    changed = true
    i = end - 1
  }
  return { text: changed ? out.join('\n') : text, changed }
}

export const normalizeMarkdownDecorationResidue = (text: string): SanitizeResult => {
  const lines = String(text || '').split(/\r?\n/g)
  const headerEnd = lines[0]?.trim() === '---' ? lines.findIndex((line, index) => index > 0 && line.trim() === '---') : -1
  let inFence = false
  let fence = ''
  let changed = false
  const out: string[] = []
  for (const [index, line] of lines.entries()) {
    if (index <= headerEnd) { out.push(line); continue }
    const trimmed = line.trim()
    const mFence = trimmed.match(/^(```+|~~~+)(.*)$/)
    if (mFence) {
      if (!inFence) {
        inFence = true
        fence = mFence[1] || '```'
      } else if (trimmed.startsWith(fence)) {
        inFence = false
        fence = ''
      }
      out.push(line)
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }
    if (/^(?:\*{2,}|_{2,})?\\+$/.test(trimmed) || /^(?:\*{2,}|_{2,})$/.test(trimmed)) {
      changed = true
      continue
    }
    const shellText = trimmed.replace(/[*_\\\s]/g, '')
    if (shellText && /^[※▼◆◇•·・—\-=|/]+$/.test(shellText)) {
      changed = true
      continue
    }
    let next = line
    next = next.replace(/\*{4,}/g, '')
    next = next.replace(/^(\s*)0;(?=\S)/, '$1')
    next = next.replace(/(\))\\+$/g, '$1')
    next = next.replace(/[ \t]+\\/g, '\\')
    if (next !== line) changed = true
    out.push(next)
  }
  return { text: changed ? out.join('\n') : text, changed }
}
