const maybeExtractStructuredDocumentSlice = (raw: string): { agenticOs: string | null; wrapperStart: number; wrapperEnd: number } => {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim()
  if (!text) return { agenticOs: null, wrapperStart: -1, wrapperEnd: -1 }
  if (text.startsWith('---\n')) {
    return {
      agenticOs: text,
      wrapperStart: 0,
      wrapperEnd: text.length,
    }
  }

  const agenticOsFenceRx = /(^|\n)\s*```+agenticOs\s*\n([\s\S]*?)\n\s*```+/gi
  const agenticOsMatches: Array<{ full: string; body: string; start: number; end: number }> = []
  let match: RegExpExecArray | null
  while ((match = agenticOsFenceRx.exec(text))) {
    const full = String(match[0] || '')
    const body = typeof match[2] === 'string' ? String(match[2] || '').trim() : ''
    if (!full || !body || typeof match.index !== 'number') continue
    agenticOsMatches.push({
      full,
      body,
      start: match.index,
      end: match.index + full.length,
    })
    if (agenticOsMatches.length > 2) break
  }
  if (agenticOsMatches.length === 1) {
    const only = agenticOsMatches[0]
    return {
      agenticOs: only.body,
      wrapperStart: only.start,
      wrapperEnd: only.end,
    }
  }

  const outerFenceMatch = /(^|\n)([ \t]*```+[^\n]*\n)(---\n)/.exec(text)
  if (outerFenceMatch && typeof outerFenceMatch.index === 'number') {
    const wrapperStart = outerFenceMatch.index + outerFenceMatch[1].length
    const documentStart = wrapperStart + outerFenceMatch[2].length
    const closingFenceStart = text.lastIndexOf('\n```')
    if (documentStart >= 0 && closingFenceStart > documentStart) {
      return {
        agenticOs: text.slice(documentStart, closingFenceStart).trim(),
        wrapperStart,
        wrapperEnd: Math.min(text.length, closingFenceStart + 1),
      }
    }
  }

  const rawDocumentStart = text.indexOf('\n---\n')
  if (rawDocumentStart >= 0) {
    return {
      agenticOs: text.slice(rawDocumentStart + 1).trim(),
      wrapperStart: rawDocumentStart + 1,
      wrapperEnd: text.length,
    }
  }
  return { agenticOs: null, wrapperStart: -1, wrapperEnd: -1 }
}

export const recoverStructuredAgenticOsAssistantPayload = (
  raw: string,
): { answer: string; agenticOs: string | null } => {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim()
  if (!text) return { answer: '', agenticOs: null }
  const recovered = maybeExtractStructuredDocumentSlice(text)
  const agenticOs = typeof recovered.agenticOs === 'string' ? recovered.agenticOs.trim() : ''
  if (!agenticOs) return { answer: text, agenticOs: null }
  if (recovered.wrapperStart <= 0 && recovered.wrapperEnd >= text.length) {
    return { answer: '', agenticOs }
  }
  const answer = [
    text.slice(0, Math.max(0, recovered.wrapperStart)).trim(),
    text.slice(Math.max(0, recovered.wrapperEnd)).replace(/^\s*```+[^\n]*\s*/g, '').trim(),
  ].filter(Boolean).join('\n\n').trim()
  return { answer, agenticOs }
}
