export const isMermaidCodeFenceLang = (lang: string): boolean => {
  const v = String(lang || '').trim().toLowerCase()
  return v === 'mermaid' || v === 'mmd'
}

export type MermaidDiagramKind = 'flowchart' | 'sequence' | 'gitgraph' | 'gantt' | 'timeline' | 'architecture' | 'eventmodeling' | 'unknown'

export type MermaidDiagramSlice = {
  code: string
  offset: number
  kind: MermaidDiagramKind
}

const readMeaningfulMermaidLine = (line: string): string => {
  const trimmed = String(line || '').trim()
  if (!trimmed || trimmed.startsWith('%%')) return ''
  return trimmed
}

export const readMermaidDiagramKindFromLine = (line: string): MermaidDiagramKind => {
  const meaningful = readMeaningfulMermaidLine(line)
  if (!meaningful) return 'unknown'
  if (/^(?:graph|flowchart)\b/i.test(meaningful)) return 'flowchart'
  if (/^sequenceDiagram\b/.test(meaningful)) return 'sequence'
  if (/^gitgraph\b:?\s*/i.test(meaningful)) return 'gitgraph'
  if (/^gantt\b:?\s*/i.test(meaningful)) return 'gantt'
  if (/^timeline\b:?\s*/i.test(meaningful)) return 'timeline'
  if (/^architecture-beta\b:?\s*/i.test(meaningful)) return 'architecture'
  if (/^eventmodeling\b:?\s*/i.test(meaningful)) return 'eventmodeling'
  return 'unknown'
}

export const readMermaidDiagramDeclaration = (code: string): { line: string; lineIndex: number; kind: MermaidDiagramKind } | null => {
  const lines = String(code || '').split('\n')
  let i = 0
  while (i < lines.length) {
    const meaningful = readMeaningfulMermaidLine(lines[i] || '')
    if (!meaningful) {
      i += 1
      continue
    }
    if (meaningful === '---') {
      let close = -1
      for (let j = i + 1; j < lines.length; j += 1) {
        if (String(lines[j] || '').trim() === '---') {
          close = j
          break
        }
      }
      if (close >= 0) {
        i = close + 1
        continue
      }
    }
    const kind = readMermaidDiagramKindFromLine(meaningful)
    return { line: meaningful, lineIndex: i, kind }
  }
  return null
}

export const readMermaidDiagramKind = (code: string): MermaidDiagramKind => {
  return readMermaidDiagramDeclaration(code)?.kind || 'unknown'
}

export const isSupportedMermaidDiagramDeclarationLine = (line: string): boolean => {
  return readMermaidDiagramKindFromLine(line) !== 'unknown'
}

export const splitMermaidDiagrams = (code: string): MermaidDiagramSlice[] => {
  const raw = String(code || '')
  const lines = raw.split('\n')
  const indices: Array<{ index: number; kind: MermaidDiagramKind }> = []
  for (let i = 0; i < lines.length; i += 1) {
    const meaningful = readMeaningfulMermaidLine(lines[i] || '')
    if (!meaningful) continue
    if (meaningful === '---') {
      for (let j = i + 1; j < lines.length; j += 1) {
        if (String(lines[j] || '').trim() === '---') {
          i = j
          break
        }
      }
      continue
    }
    const kind = readMermaidDiagramKindFromLine(meaningful)
    if (kind !== 'unknown') indices.push({ index: i, kind })
  }
  if (indices.length === 0) {
    return [{ code: raw, offset: 0, kind: readMermaidDiagramKind(raw) }]
  }

  const findSliceStart = (declarationIndex: number, lowerBound: number): number => {
    let close = declarationIndex - 1
    while (close >= lowerBound && !readMeaningfulMermaidLine(lines[close] || '')) close -= 1
    if (close < lowerBound || String(lines[close] || '').trim() !== '---') return declarationIndex
    for (let open = close - 1; open >= lowerBound; open -= 1) {
      if (String(lines[open] || '').trim() === '---') return open
    }
    return declarationIndex
  }

  const starts = indices.map((entry, index) => {
    const lowerBound = index === 0 ? 0 : indices[index - 1]!.index + 1
    return findSliceStart(entry.index, lowerBound)
  })

  if (indices.length === 1) {
    const start = indices[0]!
    const sliceStart = starts[0] ?? start.index
    return [{ code: lines.slice(sliceStart).join('\n'), offset: sliceStart, kind: start.kind }]
  }
  const out: MermaidDiagramSlice[] = []
  for (let i = 0; i < indices.length; i += 1) {
    const start = indices[i]!
    const sliceStart = starts[i] ?? start.index
    const end = i + 1 < indices.length ? starts[i + 1] ?? indices[i + 1]!.index : lines.length
    const slice = lines.slice(sliceStart, end).join('\n')
    if (!slice.trim()) continue
    out.push({ code: slice, offset: sliceStart, kind: start.kind })
  }
  return out.length > 0 ? out : [{ code: raw, offset: 0, kind: readMermaidDiagramKind(raw) }]
}

export const normalizeMermaidCodeForRuntime = (code: string): string => {
  if (readMermaidDiagramKind(code) === 'sequence') return String(code || '')
  const lines = String(code || '').split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '')

    const clickRow = /^([\t ]*)click\s+([A-Za-z0-9_.:-]+)([\s\S]*)$/.exec(line)
    if (clickRow) {
      const indent = clickRow[1] || ''
      const nodeId = String(clickRow[2] || '').trim()
      const rest = String(clickRow[3] || '')
      const trimmedRest = rest.trim()
      const keywordMatch = /^(href|call)\b/i.exec(trimmedRest)
      const keyword = keywordMatch ? String(keywordMatch[1] || '').toLowerCase() : 'href'
      const afterKeyword = keywordMatch ? trimmedRest.slice(keywordMatch[0].length).trim() : trimmedRest

      const quoted = (() => {
        const out: string[] = []
        const rx = /"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g
        const matches = afterKeyword.match(rx) || []
        for (let j = 0; j < matches.length; j += 1) {
          const token = String(matches[j] || '').trim()
          if (token) out.push(token)
        }
        return out
      })()

      if (nodeId && keyword === 'href' && quoted.length >= 1) {
        const target = quoted[0]!
        const tooltip = quoted[1]
        lines[i] = `${indent}click ${nodeId} href ${target}${tooltip ? ` ${tooltip}` : ''}`
        continue
      }
      if (nodeId && keyword === 'call' && quoted.length >= 1) {
        const target = quoted[0]!
        const tooltip = quoted[1]
        lines[i] = `${indent}click ${nodeId} call ${target}${tooltip ? ` ${tooltip}` : ''}`
        continue
      }
    }

    if (!/-->|-\.->|==>/.test(line)) continue
    if (/^\s*%%/.test(line)) continue

    let next = line
    // Preserve Mermaid textual edge labels by canonicalizing them to piped labels
    // before generic spacing compaction mutates token boundaries.
    next = next.replace(/--\s+([^|<>\n]+?)\s+-->/g, (_full, label: string) => {
      const text = String(label || '').trim()
      if (!text) return _full
      return `-->|${text}|`
    })
    next = next.replace(/-\.\s+([^|<>\n]+?)\s+\.->/g, (_full, label: string) => {
      const text = String(label || '').trim()
      if (!text) return _full
      return `-.->|${text}|`
    })
    next = next.replace(/==\s+([^|<>\n]+?)\s+==>/g, (_full, label: string) => {
      const text = String(label || '').trim()
      if (!text) return _full
      return `==>|${text}|`
    })
    next = next.replace(/(\S)\s+(-->|-\.->|==>)/g, '$1$2')
    next = next.replace(/(-->|-\.->|==>)\s+/g, '$1')
    next = next.replace(/(-->|-\.->|==>)\s*\|/g, '$1|')
    next = next.replace(/(\|[^|]*\|)\s+/g, '$1')
    lines[i] = next
  }
  return lines.join('\n')
}

export const containsFrontmatterMermaid = (text: string): boolean => {
  const raw = String(text || '')
  if (!raw.trim()) return false
  if (!raw.startsWith('---')) return false
  const end = raw.indexOf('\n---')
  if (end < 0) return false
  const blockEnd = end + 4
  const next = raw.charAt(blockEnd)
  if (next && next !== '\n' && next !== '\r') return false
  return /\bmermaid\s*:/i.test(raw.slice(0, blockEnd))
}

export const normalizeMermaidMmdToMarkdown = (name: string, text: string): string => {
  const fileName = String(name || '').trim().toLowerCase()
  if (!fileName.endsWith('.mmd')) return String(text || '')

  const raw = String(text || '')
  const trimmed = raw.trim()
  if (!trimmed) return raw

  if (/^\s*(```+|~~~+)/m.test(raw)) return raw
  if (/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/.test(raw)) return raw

  return ['```mermaid', trimmed, '```', ''].join('\n')
}

export const isMarkdownLikeFileName = (name: string): boolean => {
  const lower = String(name || '').trim().toLowerCase()
  return (
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    lower.endsWith('.mmd') ||
    lower.endsWith('.mdx')
  )
}
