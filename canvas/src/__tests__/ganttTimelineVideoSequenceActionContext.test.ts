import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildMermaidGanttTimelineModel, replaceFirstMermaidGanttFrontmatterCode, updateMermaidGanttVideoSequenceClipTiming } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { commitGanttTimelineVideoSequenceCode } from '@/features/gitgraph/ganttTimelineVideoSequenceCommit'
import {
  resolveGanttTimelineVideoSequenceActionContext,
  resolveGanttTimelineVideoSequenceSelectedRowKey,
} from '@/features/gitgraph/ganttTimelineVideoSequenceActionContext'
import { commitTimelineDocumentMutation } from '@/components/timeline/timelineSurfaceBindings'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { readDocumentVersions } from '@/features/document-versioning/documentVersioning'

const readSource = (...parts: string[]): string => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')

const wrapMarkdown = (code: string, typeToken = 'mermaid_gantt'): string => [
  '---',
  'flow_diagrams:',
  '  video_sequence:',
  '    key: video_sequence',
  `    type: ${typeToken}`,
  '    value: |-',
  ...code.split('\n').map(line => `      ${line}`),
  '---',
  '',
].join('\n')

export function testGanttTimelineVideoSequenceActionContextRebasesOntoCurrentDocument() {
  const staleCode = [
    'gantt',
    '  title Video Sequence Timeline',
    '  dateFormat HH:mm',
    '  axisFormat %H:%M',
    '  section Source video',
    '  Source video : operator_source_video, kgpos_0, 1m',
  ].join('\n')
  const currentCode = staleCode.replace('operator_source_video, kgpos_0, 1m', 'kgmedia_video_1, kgsrc_0_0_252, kgpos_0_158, 0.252m')
  const staleSpan = buildMermaidGanttTimelineModel(staleCode).taskSpans[0]
  const context = resolveGanttTimelineVideoSequenceActionContext({
    code: staleCode,
    markdownDocumentName: 'demo.md',
    markdownText: wrapMarkdown(staleCode),
    maxMinutes: 1,
    readDocumentSnapshot: () => ({
      markdownDocumentName: 'demo.md',
      markdownText: wrapMarkdown(currentCode),
    }),
    selectedSpan: staleSpan,
  })
  if (!context || context.code !== currentCode || context.selectedSpan.label !== 'Source video') {
    throw new Error(`expected action context to use current document code: ${JSON.stringify(context)}`)
  }
  const sourceCode = 'gantt\n  title Video Sequence\n  section VIDEO\n  Source video : clip_1, kgsrc_0_52, kgpos_0, 0.867m\n  section AUDIO\n  Source audio : clip_1_audio, kgsrc_0_52, kgpos_0, 0.867m'
  const rejectStale = () => { throw new Error('stale commit') }
  for (const typeToken of ['mermaid_gantt', '"mermaid_gantt"', "'mermaid_gantt'", '"mermaid_gantt" # diagram']) {
    let code = sourceCode
    let snapshot = { markdownDocumentName: 'demo.md', markdownText: wrapMarkdown(code, typeToken) + 'Body\n' }
    for (const mode of ['move', 'resize-end'] as const) {
      const actionContext = { ...snapshot, code, selectedSpan: buildMermaidGanttTimelineModel(code).taskSpans[0] }
      const nextCode = updateMermaidGanttVideoSequenceClipTiming({ code, rowLineIndex: 3, mode, deltaMinutes: mode === 'move' ? 1 / 60 : -1 / 60, syncMode: 'grouped' })
      if (!nextCode || nextCode === code) throw new Error('group timing')
      const expectedText = wrapMarkdown(nextCode, typeToken) + 'Body\n'
      let writes = 0
      commitGanttTimelineVideoSequenceCode({
        actionContext, fallbackMarkdownText: '', nextCode, readDocumentSnapshot: () => snapshot,
        setMarkdownDocument: (name, text) => { writes += 1; snapshot = { markdownDocumentName: name, markdownText: text } },
        setSelectedRowKey: key => { if (!key) throw new Error('selection') },
      })
      if (writes !== 1 || snapshot.markdownText !== expectedText) throw new Error('metadata/body')
      const spans = buildMermaidGanttTimelineModel(nextCode).taskSpans
      if (spans.length !== 2 || spans.some(span => span.startMinutes !== 0.017 || span.durationMinutes !== (mode === 'move' ? 0.867 : 0.85))) throw new Error('linked lanes')
      for (const stale of [{ ...snapshot, markdownDocumentName: 'other.md' }, { ...snapshot, markdownText: snapshot.markdownText + 'newer' }]) {
        commitGanttTimelineVideoSequenceCode({ actionContext, fallbackMarkdownText: '', nextCode, readDocumentSnapshot: () => stale,
          setMarkdownDocument: rejectStale, setSelectedRowKey: rejectStale })
      }
      code = nextCode
    }
  }
  for (const typeToken of ['mermaid_flowchart', '"mermaid_gantt\'', "'mermaid_gantt\"", 'mermaid_gantt#invalid']) {
    if (replaceFirstMermaidGanttFrontmatterCode(wrapMarkdown(sourceCode, typeToken), 'gantt') !== null) throw new Error('invalid type')
  }
}

export function testGanttTimelineVideoSequenceSelectedRowKeyClearsMissingTask() {
  const code = [
    'gantt',
    '  title Video Sequence Timeline',
    '  dateFormat HH:mm',
    '  axisFormat %H:%M',
    '  section Source video',
  ].join('\n')
  const rowKey = resolveGanttTimelineVideoSequenceSelectedRowKey({ code, lineIndex: 5 })
  if (rowKey) throw new Error(`expected missing deleted task selection to clear, got ${rowKey}`)
}

export function testTimelineDocumentSnapshotReaderUsesCurrentStoreDocument() {
  const text = readSource('components', 'timeline', 'timelineSurfaceBindings.ts')
  const requiredTokens = [
    "useGraphStoreKeyRef('markdownDocumentName')",
    "useGraphStoreKeyRef('markdownDocumentText')",
    'String(storeMarkdownDocumentTextRef.current || \'\')',
  ]
  for (const token of requiredTokens) {
    if (!text.includes(token)) throw new Error(`expected timeline snapshot reader to include ${token}`)
  }
}

export async function testGanttTimelineDocumentMutationTracksAndRestoresSharedHistory() {
  const storage = new MemoryStorage()
  const { restore } = initWindowHarness({ storage })
  try {
    const store = useGraphStore.getState()
    store.resetAll()
    store.setHistoryDebounceMs(0)
    const code = [
      'gantt',
      '  title Video Sequence Timeline',
      '  section Source video',
      '  Source video : source, 0, 1m',
    ].join('\n')
    const beforeText = wrapMarkdown(code, '"mermaid_gantt"')
    const afterText = beforeText.replace('source, 0, 1m', 'source, 0, 2m')
    const sourceFile = {
      id: 'gantt-source',
      name: 'timeline.md',
      text: beforeText,
      enabled: true,
      status: 'parsed' as const,
      source: { kind: 'local' as const, path: 'workspace:/timeline.md' },
    }
    useGraphStore.setState({
      graphData: { type: 'Graph', nodes: [], edges: [], metadata: {} },
      markdownDocumentName: 'timeline.md',
      markdownDocumentText: beforeText,
      sourceFiles: [sourceFile],
    })

    let committed = false
    commitGanttTimelineVideoSequenceCode({
      actionContext: { code, markdownDocumentName: 'timeline.md', markdownText: beforeText, selectedSpan: buildMermaidGanttTimelineModel(code).taskSpans[0] },
      fallbackMarkdownText: beforeText, nextCode: code.replace('source, 0, 1m', 'source, 0, 2m'),
      readDocumentSnapshot: () => { const s = useGraphStore.getState(); return { markdownDocumentName: s.markdownDocumentName, markdownText: s.markdownDocumentText } },
      setMarkdownDocument: (name, markdownText, options) => { committed = commitTimelineDocumentMutation({ name, markdownText, ...options }) },
      setSelectedRowKey: () => {},
    })
    if (!committed) throw new Error('expected changed Gantt document to commit')
    await new Promise<void>(resolve => setTimeout(resolve, 10))

    const committedState = useGraphStore.getState()
    if (committedState.history.length !== 2 || committedState.historyIndex !== 1) {
      throw new Error(`expected before/after Gantt versions in shared history, got ${committedState.history.length}@${committedState.historyIndex}`)
    }
    if (committedState.sourceFiles[0]?.text !== afterText) {
      throw new Error('expected Gantt edit to update the active Source File atomically')
    }
    if (!readDocumentVersions('timeline.md').some(entry => entry.text === afterText && entry.label === 'Gantt Timeline edit')) {
      throw new Error('expected Gantt edit to appear in persistent document versions')
    }

    committedState.undoHistory()
    const restoredState = useGraphStore.getState()
    if (restoredState.markdownDocumentText !== beforeText || restoredState.sourceFiles[0]?.text !== beforeText) {
      throw new Error('expected shared History/GitGraph undo to restore both document and Source File text')
    }
    if (!readDocumentVersions('timeline.md').some(entry => entry.text === beforeText && entry.label === 'History restore: Before Gantt Timeline edit')) {
      throw new Error('expected restored Gantt text to be persisted as a document version')
    }
    restoredState.redoHistory()
    const redoneState = useGraphStore.getState()
    if (redoneState.markdownDocumentText !== afterText || redoneState.sourceFiles[0]?.text !== afterText) throw new Error('redo document/source')
  } finally {
    restore()
  }
}
