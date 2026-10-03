import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readYamlFrontmatterMermaidCode, extractYamlFrontmatterHeaderBlock, readYamlFrontmatterValue } from '@/lib/markdown/frontmatter'
import { parseSequence, sequencePlaybackEvents, sequenceTimedEvents, sequenceEventAtTime } from './sequenceModel'
import { useTimelineDocumentTransportController, useTimelineTransportStoreBinding } from '@/components/timeline/timelineTransport'

// Branch choices and explicit marker selection are transient; the graph store owns the sole playhead.
const EMPTY_CHOICES: Record<string, string> = {}
let branchState: { key: string; choices: Record<string, string>; selectedId?: string } = { key: '', choices: EMPTY_CHOICES }
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const read = () => branchState

export function useSequenceDocument() {
  const source = useGraphStore(useShallow(state => ({
    text: state.markdownDocumentText || '', name: state.markdownDocumentName || 'untitled',
    identity: state.markdownDocumentSourceUrl || state.markdownTokensPath || state.markdownDocumentName || 'untitled',
    applyRevision: state.markdownDocumentApplyRevision,
    revision: state.graphDataRevision,
  })))
  const fragment = React.useMemo(() => {
    const header = readYamlFrontmatterMermaidCode(source.text)
    if (/^\s*sequenceDiagram\b/.test(header)) {
      const raw = extractYamlFrontmatterHeaderBlock(source.text)!.rawBlock
      const index = raw.indexOf('sequenceDiagram')
      return { code: header, offset: raw.slice(0, index).split('\n').length - 1 }
    }
    const blocks = [...source.text.matchAll(/^```mermaid[^\n]*\n([\s\S]*?)^```\s*$/gm)]
      .filter(match => /^\s*sequenceDiagram\b/.test(match[1]!))
    // An ambiguous selection is explicit and disables playback.
    if (blocks.length > 1) return { code: 'sequenceDiagram\nMultiple sequence blocks require a single active source', offset: 0 }
    const block = blocks[0]
    return { code: block?.[1] || '', offset: block ? source.text.slice(0, block.index).split('\n').length : 0 }
  }, [source.text])
  const code = fragment.code
  const model = React.useMemo(() => {
    const parsed = parseSequence(code, `${source.identity}:${source.applyRevision}:${fragment.offset}`)
    for (const item of [...parsed.participants, ...parsed.events, ...parsed.diagnostics]) item.line += fragment.offset
    return parsed
  }, [code, fragment.offset, source.identity, source.applyRevision])
  const mermaidTheme = React.useMemo(() => readYamlFrontmatterValue(extractYamlFrontmatterHeaderBlock(source.text)?.yamlText || '', 'mermaidTheme'), [source.text])
  const branches = React.useSyncExternalStore(subscribe, read, read)
  const choices = branches.key === model.key ? branches.choices : EMPTY_CHOICES
  const events = React.useMemo(() => sequenceTimedEvents(sequencePlaybackEvents(model, choices)), [model, choices])
  const duration = events.reduce((last, event) => Math.max(last, event.startMs + event.durationMs), 0)
  const documentKey = `${model.key}:${JSON.stringify(choices)}`
  const binding = useTimelineTransportStoreBinding()
  const sourceIsCurrent = React.useCallback(() => {
    const state = useGraphStore.getState()
    return (state.markdownDocumentText || '') === source.text && state.markdownDocumentApplyRevision === source.applyRevision
  }, [source.text, source.applyRevision])
  const setTimelineTransportState = React.useCallback((update: Parameters<typeof binding.setTimelineTransportState>[0]) => {
    const currentChoices = branchState.key === model.key ? branchState.choices : EMPTY_CHOICES
    if (sourceIsCurrent() && documentKey === `${model.key}:${JSON.stringify(currentChoices)}`) binding.setTimelineTransportState(update)
  }, [sourceIsCurrent, binding.setTimelineTransportState, documentKey, model.key])
  const transport = useTimelineDocumentTransportController({ ...binding, documentKey,
    setTimelineTransportState, maxPosition: duration, active: !!code })
  const chooseBranch = React.useCallback((groupId: string, id: string) => {
    if (!sourceIsCurrent()) return
    if (!model.branches.some(branch => branch.groupId === groupId && branch.id === id)) return
    branchState = { key: model.key, choices: { ...(branchState.key === model.key ? branchState.choices : {}), [groupId]: id } }
    // Invalidate the old clock synchronously, before React commits a new branch projection.
    binding.setTimelineTransportState({ documentKey: `${model.key}:${JSON.stringify(branchState.choices)}`, position: 0, playing: false })
    listeners.forEach(listener => listener())
  }, [model, sourceIsCurrent, binding.setTimelineTransportState])
  const selectEvent = React.useCallback((id: string) => {
    if (!sourceIsCurrent()) return
    const event = model.events.find(entry => entry.id === id)
    if (!event) return
    const nextChoices = { ...choices }
    for (const branchId of event.branches) {
      const branch = model.branches.find(entry => entry.id === branchId)!
      nextChoices[branch.groupId] = branchId
    }
    const projected = sequenceTimedEvents(sequencePlaybackEvents(model, nextChoices))
    const index = projected.findIndex(entry => entry.id === id)
    if (index < 0) return
    branchState = { key: model.key, choices: nextChoices, selectedId: id }
    binding.setTimelineTransportState({ documentKey: `${model.key}:${JSON.stringify(nextChoices)}`, position: projected[index]!.startMs, playing: false })
    listeners.forEach(listener => listener())
  }, [model, choices, sourceIsCurrent, binding.setTimelineTransportState])
  const selected = branches.key === model.key ? events.find(event => event.id === branches.selectedId) : null
  const current = !transport.playing && selected && selected.startMs === transport.playbackPosition
    ? selected : sequenceEventAtTime(events, transport.playbackPosition)
  return { code, model, mermaidTheme, events, choices, documentKey, duration, transport, chooseBranch, selectEvent,
    current, revision: source.revision }
}
