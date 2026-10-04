export type SequenceParticipant = { id: string; label: string; actor: boolean; line: number }
export type SequenceBranch = { id: string; label: string; groupId: string; first: number; last: number }
export type SequenceEvent = {
  id: string; ordinal: number; line: number; from: string; to: string; label: string
  arrow: string; branches: string[]
  kind: 'call' | 'reply' | 'async' | 'note'; protocol: string
}
export type SequenceActivation = { participant: string; first: number; last: number }
export type SequenceDiagnostic = { line: number; message: string }
export type SequenceModel = {
  key: string; code: string; participants: SequenceParticipant[]; events: SequenceEvent[]
  branches: SequenceBranch[]; activations: SequenceActivation[]; diagnostics: SequenceDiagnostic[]
}
export const SEQUENCE_LIMITS = { bytes: 64 * 1024, participants: 32, events: 200, branches: 200, activations: 200, depth: 8, diagnostics: 32 } as const

/** Stable source identity, independent of the renderer and repeated message labels. */
export function sequenceSourceKey(text: string): string {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16)
}

/** Deliberately bounded grammar. Unsupported lines prevent playback, rather than disappearing. */
export function parseSequence(code: string, scope = 'sequence'): SequenceModel {
  const key = `${scope}:${sequenceSourceKey(code)}`
  const model: SequenceModel = { key, code, participants: [], events: [], branches: [], activations: [], diagnostics: [] }
  let stopped = false
  const report = (line: number, message: string) => {
    if (stopped) return
    if (model.diagnostics.length === SEQUENCE_LIMITS.diagnostics - 1) {
      model.diagnostics.push({ line, message: 'Diagnostic limit reached; remaining source was not parsed' })
      stopped = true
    } else model.diagnostics.push({ line, message })
  }
  const stop = (line: number, message: string) => { report(line, message); stopped = true }
  if (new TextEncoder().encode(code).length > SEQUENCE_LIMITS.bytes) {
    report(1, `Sequence exceeds ${SEQUENCE_LIMITS.bytes} bytes`); return model
  }
  const people = new Map<string, SequenceParticipant>()
  const stack: Array<{ groupId: string; branch: SequenceBranch }> = []
  const active = new Map<string, number[]>()
  const person = (id: string, line: number, label = id, actor = false) => {
    if (people.has(id)) return true
    if (people.size >= SEQUENCE_LIMITS.participants) { stop(line, 'Participant limit exceeded'); return false }
    const participant = { id, label, actor, line }; people.set(id, participant); model.participants.push(participant)
    return true
  }
  let header = false, activationCount = 0
  const lines = code.split('\n')
  for (const [index, raw] of lines.entries()) {
    if (stopped) break
    const line = index + 1, text = raw.trim()
    if (text.includes('%%{')) { report(line, 'Executable or configuration directives are not supported'); continue }
    if (!text || (text.startsWith('%%') && !text.startsWith('%%{'))) continue
    if (!header) {
      header = true
      if (text !== 'sequenceDiagram') report(line, 'Expected sequenceDiagram')
      continue
    }
    if (text === 'autonumber') continue
    let match = /^(participant|actor)\s+([A-Za-z_][\w.-]*)(?:\s+as\s+(.+))?$/.exec(text)
    if (match) {
      if (people.has(match[2]!)) report(line, `Duplicate participant ${match[2]}`)
      else person(match[2]!, line, match[3] || match[2]!, match[1] === 'actor')
      continue
    }
    match = /^(alt|else)\s+(.+)$/.exec(text)
    if (match) {
      const current = stack[stack.length - 1]
      if (match[1] === 'else' && !current) { report(line, 'else has no alt'); continue }
      if (match[1] === 'alt' && stack.length >= SEQUENCE_LIMITS.depth) { stop(line, 'Branch nesting limit exceeded'); continue }
      if (model.branches.length >= SEQUENCE_LIMITS.branches) { stop(line, 'Branch limit exceeded'); continue }
      if (match[1] === 'else') current!.branch.last = model.events.length
      const groupId = match[1] === 'alt' ? `${key}:alt:${line}` : current!.groupId
      const branch = { id: `${key}:branch:${line}`, groupId, label: match[2]!, first: model.events.length, last: model.events.length }
      model.branches.push(branch)
      if (match[1] === 'else') current!.branch = branch
      else stack.push({ groupId, branch })
      continue
    }
    if (text === 'end') {
      const current = stack.pop()
      if (!current) report(line, 'end has no alt')
      else current.branch.last = model.events.length
      continue
    }
    match = /^(activate|deactivate)\s+([A-Za-z_][\w.-]*)$/.exec(text)
    if (match) {
      const id = match[2]!
      if (!people.has(id)) { report(line, `Unknown activation participant ${id}`); continue }
      const starts = active.get(id) || []
      if (match[1] === 'activate') {
        if (activationCount >= SEQUENCE_LIMITS.activations) { stop(line, 'Activation limit exceeded'); continue }
        activationCount++; starts.push(model.events.length)
      }
      else {
        const first = starts.pop()
        if (first === undefined) report(line, `Unmatched deactivate ${id}`)
        else model.activations.push({ participant: id, first, last: model.events.length })
      }
      active.set(id, starts); continue
    }
    match = /^Note\s+(?:over|right of|left of)\s+([A-Za-z_][\w.-]*)(?:\s*,\s*([A-Za-z_][\w.-]*))?\s*:\s*(.+)$/i.exec(text)
    if (match) {
      const from = match[1]!, to = match[2] || from
      if (model.events.length >= SEQUENCE_LIMITS.events) { stop(line, 'Message limit exceeded'); continue }
      if (!person(from, line) || !person(to, line)) continue
      model.events.push({ id: `${key}:event:${line}`, ordinal: model.events.length + 1, line, from, to, arrow: '', label: match[3]!, branches: stack.map(entry => entry.branch.id), kind: 'note', protocol: '' })
      continue
    }
    match = /^([A-Za-z_][\w.-]*?)\s*(-->>|->>|-->|->|--\)|-\))\s*([A-Za-z_][\w.-]*)\s*:\s*(.+)$/.exec(text)
    if (match) {
      const [, from, arrow, to, label] = match
      if (model.events.length >= SEQUENCE_LIMITS.events) { stop(line, 'Message limit exceeded'); continue }
      if (!person(from!, line) || !person(to!, line)) continue
      model.events.push({ id: `${key}:event:${line}`, ordinal: model.events.length + 1, line, from: from!, to: to!, arrow: arrow!, label: label!, branches: stack.map(entry => entry.branch.id), kind: arrow!.endsWith(')') ? 'async' : arrow!.startsWith('--') ? 'reply' : 'call', protocol: /^\[([^\]]+)\]/.exec(label!)?.[1] || '' })
      continue
    }
    report(line, `Unsupported sequence syntax: ${text.slice(0, 100)}`)
  }
  if (!header) report(1, 'Empty sequence source')
  if (stack.length) report(lines.length, 'Unclosed alt block')
  for (const [id, starts] of active) if (starts.length) report(lines.length, `Unclosed activation ${id}`)
  if (!model.events.length) report(1, 'Sequence has no messages')
  return model
}

export function sequencePlaybackEvents(model: SequenceModel, choices: Readonly<Record<string, string>> = {}): SequenceEvent[] {
  if (model.diagnostics.length) return []
  const selected = new Map<string, string>()
  for (const branch of model.branches) {
    if (!selected.has(branch.groupId)) {
      const choice = choices[branch.groupId]
      selected.set(branch.groupId, model.branches.some(b => b.groupId === branch.groupId && b.id === choice) ? choice! : branch.id)
    }
  }
  return model.events.filter(event => event.branches.every(id => {
    const branch = model.branches.find(b => b.id === id)!
    return selected.get(branch.groupId) === id
  }))
}

export function sequenceEventAt(events: readonly SequenceEvent[], position: number): SequenceEvent | null {
  if (!events.length) return null
  const finite = Number.isFinite(position) ? position : 0
  return events[Math.min(events.length - 1, Math.max(0, Math.floor(finite)))] || null
}

export type SequenceTimedEvent = SequenceEvent & { startMs: number; durationMs: number }
export function sequenceTimedEvents(events: readonly SequenceEvent[]): SequenceTimedEvent[] {
  let startMs = 0
  return events.map(event => {
    const durationMs = event.kind === 'note' ? 0 : 1000
    const timed = { ...event, startMs, durationMs }; startMs += durationMs; return timed
  })
}
export function sequenceEventAtTime(events: readonly SequenceTimedEvent[], position: number): SequenceTimedEvent | null {
  const time = Number.isFinite(position) ? Math.max(0, position) : 0
  return events.find(event => event.durationMs > 0 && time >= event.startMs && time < event.startMs + event.durationMs)
    || events[events.length - 1] || null
}
