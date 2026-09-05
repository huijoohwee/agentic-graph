import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

import type { GraphFieldSettingsResolved } from '@/features/graph-fields/graphFields'
import type { GraphNode } from '@/lib/graph/types'
import type { GraphDataTableColumnKey, GraphDataTableListItem } from '@/features/graph-data-table/graphDataTable'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { GraphDataTable } from '@/lib/graph-data-table/ui'

export async function testGraphDataTableCellSelectOverlayEditsMultiSelectProperties() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    const node: GraphNode = {
      id: 'n1',
      label: 'A',
      type: 'Node',
      properties: { status: ['Todo'] },
    }

    const nodeById = new Map<string, GraphNode>([['n1', node]])
    const edgeById = new Map<string, never>()

    const statusColumnKey = 'prop:node:status' as GraphDataTableColumnKey

    const listItems: GraphDataTableListItem[] = [
      {
        kind: 'row',
        row: {
          kind: 'node',
          id: 'n1',
          label: 'A',
          type: 'Node',
          properties: { status: ['Todo'] },
        },
      },
    ]

    const orderedVisibleColumnKeys: GraphDataTableColumnKey[] = ['label', statusColumnKey]
    const columnLabelByKey = new Map<GraphDataTableColumnKey, string>([
      ['label', 'Label'],
      [statusColumnKey, 'status'],
    ])

    const resolvedSettings: GraphFieldSettingsResolved = {
      displayName: 'status',
      isHidden: false,
      fieldType: 'Multi-select',
      isCustom: true,
      description: '',
      defaultValue: null,
      selectOptions: ['Todo', 'Doing', 'Done'],
      decimalPlaces: 0,
      currencyCode: 'USD',
      urlProtocol: 'any',
      dateTimeFormat: 'ISO',
    }

    const propertyFieldSettingsByColumnKey = new Map<GraphDataTableColumnKey, GraphFieldSettingsResolved>([
      [statusColumnKey, resolvedSettings],
    ])

    const updateNodeCalls: Array<{ id: string; patch: Partial<GraphNode> }> = []
    const updateNode = (id: string, patch: Partial<GraphNode>) => {
      updateNodeCalls.push({ id, patch })
    }

    root.render(
      React.createElement(GraphDataTable, {
        listItems,
        orderedVisibleColumnKeys,
        columnLabelByKey,
        propertyFieldSettingsByColumnKey,
        rowDensity: 'compact',
        isEmpty: false,
        disableAutoScroll: true,
        freezeFirstDataColumn: 'none',
        setFreezeFirstDataColumn: () => {},
        selectedNodeId: 'n1',
        selectedEdgeId: null,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        nodeById,
        edgeById: edgeById as unknown as Map<string, any>,
        updateNode,
        updateEdge: () => {},
        onRowClick: () => {},
        onRowDoubleClick: () => {},
        sortKey: 'label',
        sortDir: 'asc',
        onRequestAddFilter: () => {},
        onRequestGroupBy: () => {},
        onRequestHideColumn: () => {},
        onRequestSortByColumn: () => {},
      }),
    )

    const tick = () => new Promise<void>(resolve => setTimeout(() => resolve(), 0))
    await tick()
    await tick()

    const todoChip = (Array.from(doc.querySelectorAll('span')) as HTMLElement[]).find(el => el.textContent?.trim() === 'Todo')
    if (!todoChip) throw new Error('expected Todo chip to render')
    const cell = todoChip.closest('td') as HTMLTableCellElement | null
    if (!cell) throw new Error('expected Todo chip to be inside a td')

    cell.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }))
    await tick()
    await tick()

    const helper = (Array.from(doc.querySelectorAll('p')) as HTMLElement[]).find(el => el.textContent?.includes('Select tag or create one'))
    if (!helper) throw new Error('expected cell select overlay to open')

    const doingButton = (Array.from(doc.querySelectorAll('button')) as HTMLButtonElement[]).find(el => el.textContent?.includes('Doing'))
    if (!doingButton) throw new Error('expected Doing option to exist in overlay')
    doingButton.click()
    await tick()

    const call = updateNodeCalls[updateNodeCalls.length - 1]
    const nextProps = (call?.patch as { properties?: unknown })?.properties as Record<string, unknown> | undefined
    const nextStatus = nextProps?.status as unknown
    if (!Array.isArray(nextStatus) || !nextStatus.includes('Todo') || !nextStatus.includes('Doing')) {
      throw new Error('expected updateNode to receive status array including Todo and Doing')
    }
  } finally {
    try {
      await act(async () => { root?.unmount() })
    } finally {
      try { restoreDom() } finally { restoreWindow() }
    }
  }
}
