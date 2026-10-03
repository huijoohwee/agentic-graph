import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { GraphRecordInspector, type GraphRecordInspectorRow } from '@/features/graph-inspector/ui/GraphRecordInspector'
import StoryboardWidgetInspector from '@/components/StoryboardWidget/StoryboardWidgetInspector'
import type { GraphRecordColumnDoc } from '@/lib/graph-record-db'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { useGraphStore } from '@/hooks/useGraphStore'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'

export async function testInspectorTypographyUsesUiSettings() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const api = useGraphStore.getState()
    api.resetAll()
    api.setUiPanelTextFontClass('font-serif')
    api.setUiPanelKeyValueTextSizeClass('text-[15px]')
    api.setUiPanelMicroLabelTextSizeClass('text-[10px]')
    api.setUiPanelMonospaceTextClass('font-mono text-[13px]')

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    const columns: GraphRecordColumnDoc[] = [
      {
        pk: 'nodes:label',
        tableId: 'nodes',
        columnId: 'label',
        name: 'Label',
        kind: 'text',
        order: 1,
        hidden: false,
        createdAtMs: 0,
        updatedAtMs: 0,
      },
    ]

    const row: GraphRecordInspectorRow = {
      tableId: 'nodes',
      rowId: 'n1',
      order: 0,
      data: { id: 'n1', label: 'Hello' },
    }

    await act(async () => {
      root.render(
        React.createElement(
          'div',
          {},
          React.createElement(GraphRecordInspector, {
            columns,
            row,
            onClose: () => void 0,
            onDeleteRow: () => void 0,
            onChangeCell: () => void 0,
          }),
          React.createElement(StoryboardWidgetInspector, {
            active: true,
            tab: 'node',
            setTab: () => void 0,
            selectedNode: { id: 'n1', label: 'Node', type: 'Node', properties: {} },
            selectedEdge: null,
            workflowNodes: [],
            workflowSelectedNodeId: null,
            onWorkflowSelectNode: () => void 0,
            onWorkflowRunNode: () => void 0,
            jsonError: null,
            nodePropsJson: '{"a":1}',
            setNodePropsJson: () => void 0,
            nodeMetaJson: '{"b":2}',
            setNodeMetaJson: () => void 0,
            edgePropsJson: '{}',
            setEdgePropsJson: () => void 0,
            edgeMetaJson: '{}',
            setEdgeMetaJson: () => void 0,
            workflowMetaJson: '{}',
            setWorkflowMetaJson: () => void 0,
            workflowContextJson: '{}',
            setWorkflowContextJson: () => void 0,
            onSetNodeLabel: () => void 0,
            onSetNodeType: () => void 0,
            onSetEdgeLabel: () => void 0,
            onApplyJson: () => void 0,
          } as never),
        ) as never,
      )
      await Promise.resolve()
    })

    const tick = () =>
      new Promise<void>(resolve => {
        const raf = anyWindow.requestAnimationFrame
        if (typeof raf === 'function') raf(() => resolve())
        else setTimeout(() => resolve(), 0)
      })

    await act(async () => {
      await tick()
    })

    const dt = container.querySelector('dt')
    if (!dt) throw new Error('expected inspector to render a dt element')
    const dtClass = String(dt.closest('[data-panel-field-row]')?.getAttribute('class') || dt.getAttribute('class') || '')
    if (!dtClass.includes('text-[15px]')) {
      throw new Error(`expected dt to use key/value size class, got ${JSON.stringify(dtClass)}`)
    }

    const textarea = container.querySelector('textarea')
    if (!textarea) throw new Error('expected Storyboard Widget inspector to render a textarea')
    const taClass = String(textarea.getAttribute('class') || '')
    if (!taClass.includes('text-[13px]')) {
      throw new Error(`expected textarea to use monospace size class, got ${JSON.stringify(taClass)}`)
    }

    const analysis = { id: 'frame-analysis', label: 'Video Agent Frame Analysis', type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      properties: { outputSrcDoc: '<!doctype html><html><body><p>analysis-frame-content</p></body></html>' } }
    const playback = { id: 'source-playback', label: 'Source Playback', type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      properties: { outputSrcDoc: '<!doctype html><html><body><p>source-playback-content</p></body></html>' } }
    await act(async () => {
      api.setGraphData({ nodes: [playback, analysis], edges: [] })
      api.selectNodesExpanded({ nodeIds: [analysis.id], activeNodeId: analysis.id, edgeIds: [], groupIds: [] })
      root.render(React.createElement(GraphRecordInspector, {
        columns, row: { tableId: 'nodes', rowId: analysis.id, order: 1, data: analysis },
        onClose: () => void 0, onDeleteRow: () => void 0, onChangeCell: () => void 0,
      }))
      await tick()
    })
    await act(async () => { await import('@/features/graph-inspector/ui/NodeImpactInspector') })
    const widget = container.querySelector('section[aria-label="Widget"]')
    if (!widget) throw new Error('expected selected Frame Analysis widget in Inspector')
    const frame = widget.querySelector('iframe')
    if (!frame) throw new Error('expected selected Frame Analysis iframe in Inspector')
    const srcDoc = frame.getAttribute('srcdoc') || ''
    if (!srcDoc.includes('analysis-frame-content') || srcDoc.includes('source-playback-content')) {
      throw new Error('expected Inspector iframe to resolve selected Analysis content, not sibling Playback')
    }
    if (widget.textContent?.includes('Waiting for text content')) throw new Error('resolved Analysis must not render empty text fallback')
    const impact = container.querySelector('section[aria-label="Find a node"]')
    if (!impact) throw new Error('expected preserved impact inspection landmark')
    if (!(widget.compareDocumentPosition(impact) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)) {
      throw new Error('expected selected media widget before impact inspection')
    }
  } finally {
    try {
      await act(async () => {
        root?.unmount()
      })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}
