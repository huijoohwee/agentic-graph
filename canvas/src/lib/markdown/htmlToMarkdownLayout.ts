import { shouldPreserveRawHtmlMarkdownLine } from './htmlToMarkdownHeuristics'

export const postprocessMarkdownLayout = (input: string): string => {
  const raw = String(input || '').replace(/\r/g, '').trim()
  if (!raw) return ''
  const lines = raw.split('\n')
  const out: string[] = []
  let inFence = false
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('```')) {
      inFence = !inFence
      out.push(line)
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }
    if (shouldPreserveRawHtmlMarkdownLine(line)) { out.push(line); continue }
    let next = line
    next = next.replace(/\)\[/g, ') [')
    next = next.replace(/\)\!\[/g, ')\n\n![')
    next = next.replace(/(\S)(\[[^\]]+\]\([^)]+\))/g, (m, a: string, b: string) => {
      if (a === '!') return `${a}${b}`
      return `${a} ${b}`
    })
    next = next.replace(/(<https?:\/\/[^>]+>)(?=<https?:\/\/)/g, '$1\n')
    const applyWordBreaks = (s: string): string => {
      const src = String(s || '')
      if (!src) return ''
      let inCode = false
      let inLinkDest = false
      let inAutoUrl = false
      let res = ''
      for (let i = 0; i < src.length; i += 1) {
        const ch = src[i] || ''
        const prev = res.length ? res[res.length - 1] || '' : ''
        const look2 = src.slice(i, i + 2)
        const nextCh = i + 1 < src.length ? src[i + 1] || '' : ''
        if (!inCode && !inAutoUrl && look2 === '](') {
          inLinkDest = true
          res += ']('
          i += 1
          continue
        }
        if (inLinkDest) {
          res += ch
          if (ch === ')') inLinkDest = false
          continue
        }
        if (!inCode && !inAutoUrl && src.slice(i, i + 5).toLowerCase() === '<http') {
          inAutoUrl = true
          res += ch
          continue
        }
        if (inAutoUrl) {
          res += ch
          if (ch === '>') inAutoUrl = false
          continue
        }
        if (ch === '`') {
          inCode = !inCode
          res += ch
          continue
        }
        if (!inCode) {
          const isPrevLower = /[a-z]/.test(prev)
          const isPrevUpper = /[A-Z]/.test(prev)
          const isPrevDigit = /[0-9]/.test(prev)
          const isChUpper = /[A-Z]/.test(ch)
          const isChLower = /[a-z]/.test(ch)
          const isChLetter = /[A-Za-z]/.test(ch)
          const isChDigit = /[0-9]/.test(ch)
          if (prev && !/\s/.test(prev)) {
            if (isPrevLower && isChUpper) {
              let j = res.length - 1
              while (j >= 0 && /[A-Za-z]/.test(res[j] || '')) j -= 1
              const token = res.slice(j + 1)
              const tokenLen = token.length
              const hasUpperBeyondFirst = /[A-Z]/.test(token.slice(1))
              if (tokenLen >= 4 && !hasUpperBeyondFirst) {
                res += ` ${ch}`
                continue
              }
            }
            if ((isPrevLower || isPrevUpper) && isChDigit) {
              let j = res.length - 1
              while (j >= 0 && /[A-Za-z]/.test(res[j] || '')) j -= 1
              const token = res.slice(j + 1)
              const tokenLen = token.length
              const allUpper = tokenLen > 0 && /^[A-Z]+$/.test(token)
              if (!(allUpper && tokenLen <= 3)) {
                res += ` ${ch}`
                continue
              }
            }
            if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
              res += ` ${ch}`
              continue
            }
          }
        }
        res += ch
      }
      return res
    }
    next = applyWordBreaks(next)
    out.push(next)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export const dedupeMarkdownParagraphs = (input: string): string => {
  const raw = String(input || '').replace(/\r/g, '').trim()
  if (!raw) return ''
  const lines = raw.split('\n')
  const out: string[] = []
  const seen = new Set<string>()
  let buf: string[] = []
  let inFence = false

  const flush = () => {
    if (buf.length === 0) return
    const block = buf.join('\n').trimEnd()
    const normalized = block.replace(/\s+/g, ' ').trim()
    const eligible = normalized.length >= 120
    if (!eligible) {
      out.push(block)
      buf = []
      return
    }
    if (!seen.has(normalized)) {
      seen.add(normalized)
      out.push(block)
    }
    buf = []
  }

  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('```')) {
      flush()
      inFence = !inFence
      out.push(line)
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }
    if (!t) {
      flush()
      if (out.length > 0 && out[out.length - 1]?.trim() !== '') out.push('')
      continue
    }
    buf.push(line)
  }
  flush()
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

