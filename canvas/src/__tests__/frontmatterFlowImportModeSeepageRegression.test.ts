import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useGraphStore } from '@/hooks/useGraphStore'
import { GraphStoreRuntime } from '@/features/canvas/GraphStoreRuntime'
import { applySavedDocumentUiPresentationState } from '@/features/canvas/graphStoreDocumentUiRestoreHelpers'
import { applyFrontmatterFlowImportModes } from '@/features/parsers/frontmatterFlowImportMode'
import { applyInteractiveImportModes } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { resolveCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
import {
  waitForCanvasFrontmatterSurfaceTransition,
} from '@/features/parsers/canvasFrontmatterSurfaceTransition'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { materializeActiveWorkspaceEntryIntoSourceFiles } from '@/features/source-files/sourceFilesRuntimeShared'
import { LS_KEYS } from '@/lib/config'
import { readGlobalEdgeType } from '@/lib/graph/edgeTypes'
import { buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'
import { buildDocumentKey, writePerDocumentUiState } from '@/lib/persistence/perDocumentUiState'
import { lsBool } from '@/lib/persistence'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createMemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import fs from 'node:fs'
import path from 'node:path'

const STORYBOARD_WIDGET_VALIDATION_BASENAME = 'storyboard-widget-validation.md'
const STORYBOARD_WIDGET_VALIDATION_WORKSPACE_PATH = `/${STORYBOARD_WIDGET_VALIDATION_BASENAME}`
const GEOSPATIAL_VALIDATION_BASENAME = 'geospatial-validation.md'
const GEOSPATIAL_VALIDATION_WORKSPACE_PATH = `/${GEOSPATIAL_VALIDATION_BASENAME}`

const createStoryboardPresetMarkdown = (args: { title?: string; includeFlowGraph?: boolean } = {}): string => {
  const title = args.title || 'Storyboard Widget Validation'
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgDocumentStructureBaselineLock: false',
  ]
  if (args.includeFlowGraph === true) {
    lines.push(
      'flow:',
      '  nodes:',
      '    - id: validation_node',
      '      type: TextGeneration',
      '      label: Validation Node',
      '  edges: []',
    )
  }
  lines.push('---', '', `# ${title}`)
  return lines.join('\n')
}

const createGeospatialPresetMarkdown = (): string => [
  '---',
  'title: "Geospatial Validation"',
  'kgCanvasSurfaceMode: "geospatial"',
  'kgCanvasRenderMode: "2d"',
  'kgCanvas2dRenderer: "storyboard"',
  'kgDocumentSemanticMode: "document"',
  'kgFrontmatterModeEnabled: true',
  'kgDocumentStructureBaselineLock: false',
  'flow:',
  '  nodes:',
  '    - id: geospatial_node',
  '      type: Location',
  '      label: Geospatial Node',
  '  edges: []',
  '---',
  '',
  '# Geospatial Validation',
].join('\n')

export function testFrontmatterFlowImportModeUsesStoryboardRendererDefault() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas2dRenderer('d3')
  useGraphStore.getState().setDocumentSemanticMode('document')
  useGraphStore.getState().setFrontmatterModeEnabled(true)

  const changed = applyFrontmatterFlowImportModes({
    type: 'Graph',
    context: 'frontmatter-flow',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [{ id: 'w1', type: 'TextGeneration', label: 'w1', properties: { 'flow:widgetFormId': 'textGeneration.openai' } }],
    edges: [],
  } as never)

  const st = useGraphStore.getState()
  if (st.canvas2dRenderer !== 'storyboard') {
    throw new Error(`expected import mode to prefer storyboard renderer, got ${String(st.canvas2dRenderer)}`)
  }
  if (changed !== true) {
    throw new Error('expected import mode to report changed when renderer switched')
  }
}

export function testFrontmatterFlowImportModePreservesExplicitRendererPreset() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas2dRenderer('storyboard')
  useGraphStore.getState().setDocumentSemanticMode('document')
  useGraphStore.getState().setFrontmatterModeEnabled(true)

  const handled = applyFrontmatterFlowImportModes({
    type: 'Graph',
    context: 'frontmatter-flow',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [{ id: 'design-doc', type: 'Document', label: 'Design doc' }],
    edges: [],
  } as never, {
    preset: {
      canvasSurfaceMode: '2d',
      canvasRenderMode: '2d',
      canvas2dRenderer: 'design',
      documentSemanticMode: 'document',
      frontmatterModeEnabled: true,
    },
  })

  const st = useGraphStore.getState()
  if (handled !== true) {
    throw new Error('expected frontmatter-flow import mode to handle explicit renderer presets')
  }
  if (st.canvas2dRenderer !== 'design') {
    throw new Error(`expected explicit Source Files/YAML renderer preset to win over Storyboard default, got ${String(st.canvas2dRenderer)}`)
  }
}

export function testFrontmatterFlowImportModePreservesNormalizedGraphRendererPreset() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas2dRenderer('storyboard')
  useGraphStore.getState().setDocumentSemanticMode('document')
  useGraphStore.getState().setFrontmatterModeEnabled(true)

  const graphData = {
    type: 'Graph',
    context: 'frontmatter-flow',
    metadata: {
      kind: 'frontmatter-flow',
      canvasWorkspacePreset: {
        canvasSurfaceMode: '2d',
        canvasRenderMode: '2d',
        canvas2dRenderer: 'd3',
        documentSemanticMode: 'document',
        frontmatterModeEnabled: true,
        multiDimTableModeEnabled: false,
        documentStructureBaselineLock: false,
      },
    },
    nodes: [{ id: 'maps-readme', type: 'Document', label: 'Maps README' }],
    edges: [],
  } as never

  const preset = resolveCanvasFrontmatterPreset({ graphData })
  if (preset?.canvas2dRenderer !== 'd3') {
    throw new Error(`expected normalized graph preset to resolve d3, got ${String(preset?.canvas2dRenderer)}`)
  }

  const handled = applyFrontmatterFlowImportModes(graphData)
  const st = useGraphStore.getState()
  if (handled !== true) {
    throw new Error('expected frontmatter-flow import modes to handle normalized graph renderer preset')
  }
  if (st.canvas2dRenderer !== 'd3') {
    throw new Error(`expected normalized graph preset to preserve d3 renderer, got ${String(st.canvas2dRenderer)}`)
  }
}

export function testFrontmatterFlowImportModeReportsHandledWhenPresetAlreadyAligned() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas2dRenderer('storyboard')
  useGraphStore.getState().setDocumentSemanticMode('document')
  useGraphStore.getState().setFrontmatterModeEnabled(true)
  useGraphStore.getState().setMultiDimTableModeEnabled(false)

  const handled = applyFrontmatterFlowImportModes({
    type: 'Graph',
    context: 'frontmatter-flow',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [{ id: 'w1', type: 'TextGeneration', label: 'w1', properties: { 'flow:widgetFormId': 'textGeneration.openai' } }],
    edges: [],
  } as never)

  if (handled !== true) {
    throw new Error('expected frontmatter-flow import mode to report handled even when no fallback state mutation is needed')
  }
}

export function testFrontmatterFlowImportModeStoryboardPresetDisablesConflictingTableMode() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas2dRenderer('d3')
  useGraphStore.getState().setDocumentSemanticMode('keyword')
  useGraphStore.getState().setFrontmatterModeEnabled(false)
  useGraphStore.getState().setMultiDimTableModeEnabled(false)

  const handled = applyFrontmatterFlowImportModes({
    type: 'Graph',
    context: 'frontmatter-flow',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [{ id: 'w1', type: 'TextGeneration', label: 'w1', properties: { 'flow:widgetFormId': 'textGeneration.openai' } }],
    edges: [],
  } as never, {
    preset: {
      canvasSurfaceMode: '2d',
      canvasRenderMode: '2d',
      canvas2dRenderer: 'storyboard',
      documentSemanticMode: 'document',
      frontmatterModeEnabled: true,
      multiDimTableModeEnabled: true,
    },
  })

  const st = useGraphStore.getState()
  if (handled !== true) {
    throw new Error('expected frontmatter-flow import mode to handle Storyboard presets with conflicting table mode')
  }
  if (st.canvas2dRenderer !== 'storyboard') {
    throw new Error(`expected Storyboard preset to avoid D3 table-mode demotion, got ${String(st.canvas2dRenderer)}`)
  }
  if (st.documentSemanticMode !== 'document') {
    throw new Error(`expected Storyboard preset to keep document mode, got ${String(st.documentSemanticMode)}`)
  }
  if (st.frontmatterModeEnabled !== true) {
    throw new Error('expected Storyboard preset to keep frontmatter mode enabled')
  }
  if (st.multiDimTableModeEnabled !== false) {
    throw new Error('expected Storyboard preset to disable conflicting multi-dimensional table mode')
  }
}

export function testFrontmatterFlowImportModeClearsWidgetScreenAndWorldPlacementCaches() {
  useGraphStore.getState().resetAll()
  const graph = {
    type: 'Graph',
    context: 'frontmatter-flow',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [{ id: 'w1', type: 'TextGeneration', label: 'w1', properties: { 'flow:widgetFormId': 'textGeneration.openai' } }],
    edges: [],
  } as const
  const graphKey = buildGraphMetaKeyIgnoringPending(graph as never) || 'frontmatter-flow:demo'
  useGraphStore.setState({
    flowWidgetPinnedByNodeId: { w1: false },
    flowWidgetPinnedByNodeIdByGraphMetaKey: {
      [graphKey]: { w1: false },
    },
    flowWidgetPosByNodeId: { w1: { left: 2400, top: 700 } },
    flowWidgetPosByNodeIdByGraphMetaKey: {
      [graphKey]: { w1: { left: 2400, top: 700 } },
    },
    flowWidgetWorldPosByNodeId: { w1: { x: 2400, y: 700 } },
    flowWidgetWorldPosByNodeIdByGraphMetaKey: {
      [graphKey]: { w1: { x: 2400, y: 700 } },
    },
  })

  applyFrontmatterFlowImportModes(graph as never)

  const st = useGraphStore.getState()
  if (Object.keys(st.flowWidgetPinnedByNodeId || {}).length !== 0) {
    throw new Error('expected frontmatter-flow import mode to clear global widget pin cache')
  }
  if (Object.keys(st.flowWidgetPosByNodeId || {}).length !== 0) {
    throw new Error('expected frontmatter-flow import mode to clear global widget screen placement cache')
  }
  if (Object.keys(st.flowWidgetWorldPosByNodeId || {}).length !== 0) {
    throw new Error('expected frontmatter-flow import mode to clear global widget world placement cache')
  }
  if (Object.keys((st.flowWidgetPinnedByNodeIdByGraphMetaKey || {})[graphKey] || {}).length !== 0) {
    throw new Error('expected frontmatter-flow import mode to clear keyed widget pin cache')
  }
  if (Object.keys((st.flowWidgetPosByNodeIdByGraphMetaKey || {})[graphKey] || {}).length !== 0) {
    throw new Error('expected frontmatter-flow import mode to clear keyed widget screen placement cache')
  }
  if (Object.keys((st.flowWidgetWorldPosByNodeIdByGraphMetaKey || {})[graphKey] || {}).length !== 0) {
    throw new Error('expected frontmatter-flow import mode to clear keyed widget world placement cache')
  }
}

export function testWorkspaceImportModesPreferFrontmatterFlowLandingContract() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas2dRenderer('d3')
  useGraphStore.getState().setDocumentSemanticMode('keyword')
  useGraphStore.getState().setFrontmatterModeEnabled(false)
  useGraphStore.getState().setMultiDimTableModeEnabled(true)

  applyInteractiveImportModes({
    graphData: {
      type: 'Graph',
      context: 'frontmatter-flow',
      metadata: {
        kind: 'frontmatter-flow',
        frontmatterFlowSettings: {
          edgeType: 'smoothstep',
        },
      },
      nodes: [{ id: 'w1', type: 'TextGeneration', label: 'w1', properties: { 'flow:widgetFormId': 'textGeneration' } }],
      edges: [],
    } as never,
  })

  const st = useGraphStore.getState()
  if (st.canvasRenderMode !== '2d') throw new Error(`expected 2d canvas render mode, got ${String(st.canvasRenderMode)}`)
  if (st.canvas2dRenderer !== 'storyboard') throw new Error(`expected storyboard renderer, got ${String(st.canvas2dRenderer)}`)
  if (st.documentSemanticMode !== 'document') throw new Error(`expected document semantic mode, got ${String(st.documentSemanticMode)}`)
  if (st.frontmatterModeEnabled !== true) throw new Error('expected frontmatter mode enabled for frontmatter-flow import landing')
  if (st.multiDimTableModeEnabled !== false) throw new Error('expected multidim table disabled for frontmatter-flow import landing')
  if (readGlobalEdgeType(st.schema) !== 'smoothstep') {
    throw new Error(`expected frontmatter-flow import landing to sync schema edge type, got ${readGlobalEdgeType(st.schema)}`)
  }
}

export function testWorkspaceImportModesPreferFrontmatterOnlyDocLandingContract() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  useGraphStore.getState().setCanvasRenderMode('3d')
  useGraphStore.getState().setCanvas2dRenderer('d3')
  useGraphStore.getState().setDocumentSemanticMode('keyword')
  useGraphStore.getState().setFrontmatterModeEnabled(false)
  useGraphStore.getState().setMultiDimTableModeEnabled(true)

  applyInteractiveImportModes({ frontmatterOnlyDoc: true })

  const st = useGraphStore.getState()
  if (st.canvasRenderMode !== '2d') throw new Error(`expected frontmatter-only import to force 2d render mode, got ${String(st.canvasRenderMode)}`)
  if (st.canvas2dRenderer !== 'storyboard') throw new Error(`expected frontmatter-only import to prefer storyboard renderer, got ${String(st.canvas2dRenderer)}`)
  if (st.documentSemanticMode !== 'document') throw new Error(`expected frontmatter-only import to force document semantic mode, got ${String(st.documentSemanticMode)}`)
  if (st.frontmatterModeEnabled !== true) throw new Error('expected frontmatter-only import to enable frontmatter mode')
  if (st.multiDimTableModeEnabled !== false) throw new Error('expected frontmatter-only import to disable multidim table mode')
}

export function testWorkspaceImportModesHonorExplicitMarkdownFrontmatterPreset() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(true)
  useGraphStore.getState().setCanvasRenderMode('3d')
  useGraphStore.getState().setCanvas2dRenderer('storyboard')
  useGraphStore.getState().setDocumentSemanticMode('keyword')
  useGraphStore.getState().setFrontmatterModeEnabled(false)

  const rawText = [
    '---',
    'title: "Knowgrph"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "d3"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgDocumentStructureBaselineLock: false',
    '---',
    '',
    '# Knowgrph',
  ].join('\n')

  const preset = resolveCanvasFrontmatterPreset({ rawText })
  if (!preset) throw new Error('expected explicit markdown frontmatter preset to resolve')
  if (preset.canvas2dRenderer !== 'd3') throw new Error(`expected preset renderer d3, got ${String(preset.canvas2dRenderer)}`)
  if (preset.documentStructureBaselineLock !== false) throw new Error('expected preset view lock to resolve OFF')

  applyInteractiveImportModes({ rawText })

  const st = useGraphStore.getState()
  if (st.canvasRenderMode !== '2d') throw new Error(`expected explicit preset to force 2d canvas render mode, got ${String(st.canvasRenderMode)}`)
  if (st.canvas2dRenderer !== 'd3') throw new Error(`expected explicit preset to force d3 renderer, got ${String(st.canvas2dRenderer)}`)
  if (st.documentSemanticMode !== 'document') throw new Error(`expected explicit preset to force document semantic mode, got ${String(st.documentSemanticMode)}`)
  if (st.frontmatterModeEnabled !== true) throw new Error('expected explicit preset to enable frontmatter mode')
  if (st.documentStructureBaselineLock !== false) throw new Error('expected explicit preset to force View Lock OFF')
}

export function testWorkspaceImportModesNormalizeCanonicalRendererTokensAndExplicitTableMode() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(true)
  useGraphStore.getState().setCanvasRenderMode('3d')
  useGraphStore.getState().setCanvas2dRenderer('storyboard')
  useGraphStore.getState().setDocumentSemanticMode('document')
  useGraphStore.getState().setFrontmatterModeEnabled(true)
  useGraphStore.getState().setMultiDimTableModeEnabled(false)

  const rawText = [
    '---',
    'title: "Flowchart Token"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "flowchart"',
    'kgDocumentSemanticMode: "keyword"',
    'kgFrontmatterModeEnabled: false',
    'kgMultiDimTableModeEnabled: true',
    'kgDocumentStructureBaselineLock: false',
    '---',
    '',
    '# Flowchart Token',
  ].join('\n')

  const preset = resolveCanvasFrontmatterPreset({ rawText })
  if (!preset) throw new Error('expected flowchart canonical-token preset to resolve')
  if (preset.canvas2dRenderer !== 'flowchart') throw new Error(`expected flowchart token to normalize to flowchart, got ${String(preset.canvas2dRenderer)}`)
  if (preset.documentSemanticMode !== 'keyword') throw new Error(`expected keyword token to normalize to keyword, got ${String(preset.documentSemanticMode)}`)
  if (preset.frontmatterModeEnabled !== false) throw new Error('expected explicit frontmatter OFF to resolve')
  if (preset.multiDimTableModeEnabled !== true) throw new Error('expected explicit multi-dimensional table mode ON to resolve')

  applyInteractiveImportModes({ rawText })

  const st = useGraphStore.getState()
  if (st.canvasRenderMode !== '2d') throw new Error(`expected explicit preset to force 2d canvas render mode, got ${String(st.canvasRenderMode)}`)
  if (st.canvas2dRenderer !== 'flowchart') throw new Error(`expected flowchart token landing to use flowchart, got ${String(st.canvas2dRenderer)}`)
  if (st.documentSemanticMode !== 'keyword') throw new Error(`expected explicit keyword mode landing, got ${String(st.documentSemanticMode)}`)
  if (st.frontmatterModeEnabled !== false) throw new Error('expected explicit frontmatter OFF to be preserved')
  if (st.multiDimTableModeEnabled !== true) throw new Error('expected explicit multi-dimensional table mode ON to be preserved')
  if (st.documentStructureBaselineLock !== false) throw new Error('expected explicit preset to unlock baseline lock')
}

export function testWorkspaceImportModesStoryboardPresetDisablesConflictingTableMode() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas2dRenderer('d3')
  useGraphStore.getState().setDocumentSemanticMode('keyword')
  useGraphStore.getState().setFrontmatterModeEnabled(false)
  useGraphStore.getState().setMultiDimTableModeEnabled(false)

  const rawText = [
    '---',
    'title: "Storyboard Table Conflict"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgMultiDimTableModeEnabled: true',
    'kgDocumentStructureBaselineLock: false',
    '---',
    '',
    '# Storyboard Table Conflict',
  ].join('\n')

  const preset = resolveCanvasFrontmatterPreset({ rawText })
  if (!preset) throw new Error('expected Storyboard preset to resolve')
  if (preset.canvas2dRenderer !== 'storyboard') throw new Error(`expected Storyboard preset, got ${String(preset.canvas2dRenderer)}`)
  if (preset.multiDimTableModeEnabled !== true) throw new Error('expected source preset to preserve explicit multi-dimensional table flag')

  applyInteractiveImportModes({ rawText })

  const st = useGraphStore.getState()
  if (st.canvasRenderMode !== '2d') throw new Error(`expected Storyboard preset to force 2d canvas render mode, got ${String(st.canvasRenderMode)}`)
  if (st.canvas2dRenderer !== 'storyboard') throw new Error(`expected Storyboard preset to avoid D3 table-mode demotion, got ${String(st.canvas2dRenderer)}`)
  if (st.documentSemanticMode !== 'document') throw new Error(`expected Storyboard preset to keep document semantic mode, got ${String(st.documentSemanticMode)}`)
  if (st.frontmatterModeEnabled !== true) throw new Error('expected Storyboard preset to keep frontmatter mode enabled')
  if (st.multiDimTableModeEnabled !== false) throw new Error('expected Storyboard preset to disable conflicting multi-dimensional table mode')
  if (st.documentStructureBaselineLock !== false) throw new Error('expected Storyboard preset to unlock baseline lock')
}

export function testWorkspaceImportModesUseCanonicalFlowRendererForFrontmatterOnlyLanding() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas2dRenderer('flowchart')
  useGraphStore.getState().setDocumentSemanticMode('keyword')
  useGraphStore.getState().setFrontmatterModeEnabled(false)
  useGraphStore.getState().setMultiDimTableModeEnabled(true)

  const rawText = [
    '---',
    'title: "Flow Renderer"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "flow"',
    'kgDocumentSemanticMode: "keyword"',
    'kgFrontmatterModeEnabled: false',
    'kgMultiDimTableModeEnabled: true',
    'kgDocumentStructureBaselineLock: false',
    '---',
    '',
    '# Flow Renderer',
  ].join('\n')

  const preset = resolveCanvasFrontmatterPreset({ rawText })
  if (!preset) throw new Error('expected flow canonical-token preset to resolve')
  if (preset.canvas2dRenderer !== 'flow') throw new Error(`expected flow token to normalize to flow, got ${String(preset.canvas2dRenderer)}`)

  applyInteractiveImportModes({ rawText })

  const st = useGraphStore.getState()
  if (st.canvas2dRenderer !== 'flow') throw new Error(`expected flow token landing to use flow renderer, got ${String(st.canvas2dRenderer)}`)
  if (st.documentSemanticMode !== 'document') throw new Error(`expected frontmatter-only flow renderer to force document semantic mode, got ${String(st.documentSemanticMode)}`)
  if (st.frontmatterModeEnabled !== true) throw new Error('expected frontmatter-only flow renderer to force frontmatter mode ON')
  if (st.multiDimTableModeEnabled !== false) throw new Error('expected frontmatter-only flow renderer to force multi-dimensional table mode OFF')
}

export async function testCanvasFrontmatterPresetDisablesGeospatialOverlayFor2dDocuments() {
  const { restore, storage } = initWindowHarness({
    storage: createMemoryStorage(),
  })
  try {
    useGraphStore.getState().resetAll()
    storage.setItem(LS_KEYS.geospatialOverlayEnabled, 'true')

    const rawText = [
      '---',
      'title: "Knowgrph"',
      'kgCanvasRenderMode: "2d"',
      'kgCanvas2dRenderer: "storyboard"',
      'kgDocumentSemanticMode: "document"',
      'kgFrontmatterModeEnabled: true',
      'kgDocumentStructureBaselineLock: false',
      '---',
      '',
      '# Knowgrph',
    ].join('\n')

    applyInteractiveImportModes({ rawText })
    await waitForCanvasFrontmatterSurfaceTransition()

    const next = storage.getItem(LS_KEYS.geospatialOverlayEnabled)
    if (next !== '0' && next !== 'false') {
      throw new Error(`expected 2d frontmatter preset to disable geospatial overlay, got ${String(next)}`)
    }
  } finally {
    restore()
  }
}

export async function testCanvasFrontmatterPresetEnablesGeospatialSurfaceMode() {
  const { restore, storage } = initWindowHarness({
    storage: createMemoryStorage(),
  })
  try {
    useGraphStore.getState().resetAll()
    storage.setItem(LS_KEYS.geospatialOverlayEnabled, 'false')
    useGraphStore.getState().setCanvasRenderMode('3d')
    useGraphStore.getState().setCanvas2dRenderer('d3')
    useGraphStore.getState().setDocumentSemanticMode('keyword')
    useGraphStore.getState().setFrontmatterModeEnabled(false)
    useGraphStore.getState().setMultiDimTableModeEnabled(true)

    const rawText = [
      '---',
      'title: "GrabMaps Surface Preset"',
      'kgCanvasSurfaceMode: "geospatial"',
      'kgCanvas2dRenderer: "storyboard"',
      'kgDocumentSemanticMode: "document"',
      'kgFrontmatterModeEnabled: true',
      'kgMultiDimTableModeEnabled: false',
      'kgDocumentStructureBaselineLock: false',
      '---',
      '',
      '# GrabMaps Surface Preset',
    ].join('\n')

    const preset = resolveCanvasFrontmatterPreset({ rawText })
    if (!preset) throw new Error('expected geospatial surface preset to resolve')
    if (preset.canvasSurfaceMode !== 'geospatial') {
      throw new Error(`expected geospatial surface mode, got ${String(preset.canvasSurfaceMode || '')}`)
    }

    applyInteractiveImportModes({ rawText })
    await waitForCanvasFrontmatterSurfaceTransition()

    const st = useGraphStore.getState()
    const next = storage.getItem(LS_KEYS.geospatialOverlayEnabled)
    if (next !== '1' && next !== 'true') {
      throw new Error(`expected geospatial surface preset to enable geospatial overlay, got ${String(next)}`)
    }
    if (st.canvasRenderMode !== '2d') throw new Error(`expected geospatial surface preset to normalize render mode to 2d, got ${String(st.canvasRenderMode)}`)
    if (st.canvas2dRenderer !== 'storyboard') throw new Error(`expected geospatial surface preset to preserve storyboard renderer, got ${String(st.canvas2dRenderer)}`)
    if (st.documentSemanticMode !== 'document') throw new Error(`expected geospatial surface preset to apply document semantic mode, got ${String(st.documentSemanticMode)}`)
    if (st.frontmatterModeEnabled !== true) throw new Error('expected geospatial surface preset to enable frontmatter mode')
    if (st.multiDimTableModeEnabled !== false) throw new Error('expected geospatial surface preset to disable multi-dimensional table mode')
  } finally {
    restore()
  }
}

export async function testCanvasFrontmatterPresetEnables3dSurfaceModeAndVoxelMode() {
  const { restore, storage } = initWindowHarness({
    storage: createMemoryStorage(),
  })
  try {
    useGraphStore.getState().resetAll()
    storage.setItem(LS_KEYS.geospatialOverlayEnabled, 'true')
    useGraphStore.getState().setCanvasRenderMode('2d')
    useGraphStore.getState().setCanvas3dMode('3d')
    useGraphStore.getState().setCanvas2dRenderer('flowchart')
    useGraphStore.getState().setDocumentSemanticMode('document')
    useGraphStore.getState().setFrontmatterModeEnabled(false)
    useGraphStore.getState().setMultiDimTableModeEnabled(false)

    const rawText = [
      '---',
      'title: "3D Surface Preset"',
      'kgCanvasSurfaceMode: "3d"',
      'kgCanvas3dMode: "voxel"',
      'kgCanvas2dRenderer: "flowchart"',
      'kgDocumentSemanticMode: "document"',
      'kgFrontmatterModeEnabled: false',
      'kgMultiDimTableModeEnabled: false',
      'kgDocumentStructureBaselineLock: false',
      '---',
      '',
      '# 3D Surface Preset',
    ].join('\n')

    const preset = resolveCanvasFrontmatterPreset({ rawText })
    if (!preset) throw new Error('expected 3d surface preset to resolve')
    if (preset.canvasSurfaceMode !== '3d') throw new Error(`expected 3d surface mode, got ${String(preset.canvasSurfaceMode || '')}`)
    if (preset.canvas3dMode !== 'voxel') throw new Error(`expected voxel 3d mode, got ${String(preset.canvas3dMode || '')}`)

    applyInteractiveImportModes({ rawText })
    await waitForCanvasFrontmatterSurfaceTransition()

    const st = useGraphStore.getState()
    const next = storage.getItem(LS_KEYS.geospatialOverlayEnabled)
    if (next !== '0' && next !== 'false') {
      throw new Error(`expected 3d surface preset to disable geospatial overlay, got ${String(next)}`)
    }
    if (st.canvasRenderMode !== '3d') throw new Error(`expected 3d surface preset to force 3d render mode, got ${String(st.canvasRenderMode)}`)
    if (st.canvas3dMode !== 'voxel') throw new Error(`expected 3d surface preset to force voxel mode, got ${String(st.canvas3dMode)}`)
    if (st.canvas2dRenderer !== 'flowchart') throw new Error(`expected 3d surface preset to preserve flowchart renderer, got ${String(st.canvas2dRenderer)}`)
  } finally {
    restore()
  }
}

export async function testActiveMarkdownDocumentSwitchReappliesExplicitFrontmatterPreset() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(true)
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas2dRenderer('d3')
  useGraphStore.getState().setDocumentSemanticMode('keyword')
  useGraphStore.getState().setFrontmatterModeEnabled(false)
  useGraphStore.getState().setMultiDimTableModeEnabled(true)

  const text = createStoryboardPresetMarkdown()

  const ok = await useGraphStore.getState().setActiveMarkdownDocument({
    name: STORYBOARD_WIDGET_VALIDATION_WORKSPACE_PATH,
    text,
    normalizeMermaidMmd: false,
    autoEnableFrontmatter: false,
  })
  if (ok !== true) throw new Error('expected active markdown document switch to complete')

  const st = useGraphStore.getState()
  if (st.canvasRenderMode !== '2d') throw new Error(`expected active doc switch to preserve 2d canvas render mode, got ${String(st.canvasRenderMode)}`)
  if (st.canvas2dRenderer !== 'storyboard') throw new Error(`expected active doc switch to reapply storyboard renderer, got ${String(st.canvas2dRenderer)}`)
  if (st.documentSemanticMode !== 'document') throw new Error(`expected active doc switch to reapply document semantic mode, got ${String(st.documentSemanticMode)}`)
  if (st.frontmatterModeEnabled !== true) throw new Error('expected active doc switch to re-enable frontmatter mode')
  if (st.documentStructureBaselineLock !== false) throw new Error('expected active doc switch to reapply unlocked baseline setting')
  if (st.multiDimTableModeEnabled !== false) throw new Error('expected active doc switch to disable multi-dimensional table mode when preset reapplies')
}

export async function testGraphStoreRuntimeExplicitFrontmatterPresetBeatsSavedUiCarryover() {
  const storage = createMemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null
  try {
    useGraphStore.getState().resetAll()
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('expected test root container')
    root = createRoot(container)
    await act(async () => {
      root!.render(React.createElement(GraphStoreRuntime))
    })

    const name = '/notes/custom-table-mode.md'
    const text = [
      '---',
      'title: "Custom Table Mode"',
      'kgCanvasSurfaceMode: "2d"',
      'kgCanvasRenderMode: "2d"',
      'kgCanvas2dRenderer: "flowchart"',
      'kgDocumentSemanticMode: "Keyword Mode"',
      'kgFrontmatterModeEnabled: false',
      'kgMultiDimTableModeEnabled: true',
      'kgDocumentStructureBaselineLock: false',
      '---',
      '',
      '# Custom Table Mode',
    ].join('\n')
    const documentKey = buildDocumentKey({ name, sourceUrl: null })
    writePerDocumentUiState({
      storage,
      documentKey,
      documentRef: name,
      state: {
        canvasRenderMode: '2d',
        canvas2dRenderer: 'd3',
        documentSemanticMode: 'document',
        frontmatterModeEnabled: true,
        multiDimTableModeEnabled: false,
      },
    })

    await act(async () => {
      await useGraphStore.getState().setActiveMarkdownDocument({
        name,
        text,
        normalizeMermaidMmd: false,
        autoEnableFrontmatter: false,
      })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const next = useGraphStore.getState()
    if (next.canvas2dRenderer !== 'flowchart') {
      throw new Error(`expected explicit frontmatter preset to keep flowchart renderer, got ${String(next.canvas2dRenderer)}`)
    }
    if (next.documentSemanticMode !== 'keyword') {
      throw new Error(`expected explicit frontmatter preset to keep keyword mode, got ${String(next.documentSemanticMode)}`)
    }
    if (next.frontmatterModeEnabled !== false) {
      throw new Error('expected explicit frontmatter preset to keep frontmatter mode disabled')
    }
    if (next.multiDimTableModeEnabled !== true) {
      throw new Error('expected explicit frontmatter preset to keep multi-dimensional table mode enabled instead of restoring saved carryover')
    }
  } finally {
    try {
      await act(async () => {
        root?.unmount()
      })
    } catch {
      void 0
    }
    restore()
    restoreWindow()
  }
}

export function testPerDocumentUiRestoreKeepsAlreadyAlignedStoryboardPreset() {
  useGraphStore.getState().resetAll()
  const name = '/notes/aligned-storyboard-widget.md'
  const text = createStoryboardPresetMarkdown({ title: 'Aligned Storyboard Widget' })
  useGraphStore.getState().setMarkdownDocument(name, text, {
    autoEnableFrontmatter: false,
    applyViewPreset: true,
  })
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas2dRenderer('storyboard')
  useGraphStore.getState().setDocumentSemanticMode('document')
  useGraphStore.getState().setFrontmatterModeEnabled(true)
  useGraphStore.getState().setMultiDimTableModeEnabled(false)

  applySavedDocumentUiPresentationState(useGraphStore.getState(), {
    canvasRenderMode: '2d',
    canvas2dRenderer: 'd3',
    documentSemanticMode: 'keyword',
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: true,
  })

  const next = useGraphStore.getState()
  if (next.canvas2dRenderer !== 'storyboard') {
    throw new Error(`expected aligned Storyboard preset to block saved D3 restore, got ${String(next.canvas2dRenderer)}`)
  }
  if (next.documentSemanticMode !== 'document') {
    throw new Error(`expected aligned Storyboard preset to keep document semantic mode, got ${String(next.documentSemanticMode)}`)
  }
  if (next.frontmatterModeEnabled !== true) {
    throw new Error('expected aligned Storyboard preset to keep frontmatter mode enabled')
  }
  if (next.multiDimTableModeEnabled !== false) {
    throw new Error('expected aligned Storyboard preset to keep multi-dimensional table mode disabled')
  }
}

export async function testActiveMarkdownDocumentSwitchCanSkipExplicitFrontmatterPresetForPassiveSelection() {
  useGraphStore.getState().resetAll()
  useGraphStore.setState({
    graphData: null,
    graphDataRevision: 0,
    graphContentRevision: 0,
    docLocationRevision: 0,
  })

  const readmeText = [
    '---',
    'title: "Knowgrph"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "d3"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgDocumentStructureBaselineLock: false',
    '---',
    '',
    '# Knowgrph',
  ].join('\n')

  const seeded = await useGraphStore.getState().setActiveMarkdownDocument({
    name: '/README.md',
    text: readmeText,
    normalizeMermaidMmd: false,
    autoEnableFrontmatter: false,
  })
  if (seeded !== true) throw new Error('expected README setup switch to complete')

  {
    const before = useGraphStore.getState()
    if (before.canvas2dRenderer !== 'd3') throw new Error(`expected README setup to land on d3 renderer, got ${String(before.canvas2dRenderer)}`)
    if (before.documentSemanticMode !== 'document') throw new Error(`expected README setup to land on document semantic mode, got ${String(before.documentSemanticMode)}`)
    if (before.frontmatterModeEnabled !== true) throw new Error('expected README setup to enable frontmatter mode')
  }

  const text = createStoryboardPresetMarkdown()

  const ok = await useGraphStore.getState().setActiveMarkdownDocument({
    name: STORYBOARD_WIDGET_VALIDATION_WORKSPACE_PATH,
    text,
    normalizeMermaidMmd: false,
    autoEnableFrontmatter: false,
    applyViewPreset: false,
  })
  if (ok !== true) throw new Error('expected passive active markdown document switch to complete')

  const st = useGraphStore.getState()
  if (st.markdownDocumentName !== STORYBOARD_WIDGET_VALIDATION_WORKSPACE_PATH) {
    throw new Error(`expected passive active doc switch to update markdown document name, got ${String(st.markdownDocumentName)}`)
  }
  if (st.markdownDocumentText !== text) {
    throw new Error('expected passive active doc switch to update markdown document text')
  }
  if (st.canvas2dRenderer !== 'd3') throw new Error(`expected passive active doc switch to preserve README renderer, got ${String(st.canvas2dRenderer)}`)
  if (st.documentSemanticMode !== 'document') throw new Error(`expected passive active doc switch to preserve README semantic mode, got ${String(st.documentSemanticMode)}`)
  if (st.frontmatterModeEnabled !== true) throw new Error('expected passive active doc switch to preserve README frontmatter mode')
  if (st.documentStructureBaselineLock !== false) throw new Error('expected passive active doc switch to preserve README baseline lock setting')
}

export async function testActiveFrontmatterFlowNodeUpdateKeepsMarkdownDocumentTextCanonical() {
  useGraphStore.getState().resetAll()
  const originalSummary = 'Open on the user pain point before the product is shown.'
  const nextSummary = 'Live storyboard sync validation: Cold Open summary updated from the canvas card.'
  const text = [
    '---',
    'title: "Knowgrph Storyboard Demo"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgDocumentStructureBaselineLock: false',
    'flow:',
    '  nodes:',
    '    - id: SCENE_01',
    '      type: Scene',
    '      label: Cold Open',
    '      stage: Draft',
    `      summary: ${JSON.stringify(originalSummary)}`,
    '  edges: []',
    '---',
    '',
    '# Knowgrph Storyboard Demo',
  ].join('\n')

  useGraphStore.setState({
    graphData: {
      type: 'Graph',
      context: 'frontmatter-flow',
      metadata: { kind: 'frontmatter-flow', source: 'markdown:/docs/knowgrph-storyboard-demo.md' },
      nodes: [
        {
          id: 'SCENE_01',
          type: 'Scene',
          label: 'Cold Open',
          properties: {
            stage: 'Draft',
            summary: originalSummary,
          },
          x: 0,
          y: 0,
        },
      ],
      edges: [],
    } as never,
    graphDataRevision: 1,
    graphContentRevision: 1,
    docLocationRevision: 0,
    markdownDocumentName: '/docs/knowgrph-storyboard-demo.md',
    markdownDocumentText: text,
    sourceFiles: [],
  })

  useGraphStore.getState().updateNode('SCENE_01', {
    properties: {
      stage: 'Draft',
      summary: nextSummary,
    } as never,
  })

  const after = useGraphStore.getState()
  const afterNode = after.graphData?.nodes?.find(node => String(node?.id || '') === 'SCENE_01')
  if (String((afterNode?.properties || {}).summary || '') !== nextSummary) {
    throw new Error(`expected graph node summary writeback after updateNode, got ${JSON.stringify(afterNode)}`)
  }
  if (!String(after.markdownDocumentText || '').includes(nextSummary)) {
    throw new Error(`expected active markdown document text to include updated summary, got ${String(after.markdownDocumentText || '').slice(0, 400)}`)
  }
  if (String(after.markdownDocumentText || '').includes(originalSummary)) {
    throw new Error('expected active markdown document text to stop carrying the stale summary after updateNode writeback')
  }
}

export function testAnimaticTimelineBeatMetadataGraphWritebackSyncsActiveMarkdownDocument() {
  const text = [
    '---',
    'kgCanvas2dRenderer: animatic',
    'flow:',
    '  nodes:',
    '    - id: {key: id, type: string, value: NODE_CLIP_01}',
    '      type: {key: type, type: string, value: Clip}',
    '      label: {key: label, type: string, value: Clip 01}',
    '      params: {key: params, type: object, value: {"beat_ref":"beat_01"}}',
    'timeline:',
    '  beats:',
    '    beat_01:',
    '      label: Opening',
    '      summary: Original summary',
    '      note: Original note',
    '      tags:',
    '        - intro',
    '---',
    '',
  ].join('\n')

  useGraphStore.setState({
    graphData: {
      type: 'Graph',
      context: 'frontmatter-flow',
      metadata: {
        kind: 'frontmatter-flow',
        source: 'markdown:/docs/knowgrph-animatic-demo.md',
        frontmatterMeta: {
          kgCanvas2dRenderer: 'animatic',
          timeline: {
            beats: {
              beat_01: {
                label: 'Opening',
                summary: 'Original summary',
                note: 'Original note',
                tags: ['intro'],
              },
            },
          },
        },
      },
      nodes: [
        {
          id: 'NODE_CLIP_01',
          type: 'Clip',
          label: 'Clip 01',
          properties: {
            params: {
              beat_ref: 'beat_01',
            },
          },
          x: 0,
          y: 0,
        },
      ],
      edges: [],
    } as never,
    graphDataRevision: 1,
    graphContentRevision: 1,
    docLocationRevision: 0,
    markdownDocumentName: '/docs/knowgrph-animatic-demo.md',
    markdownDocumentText: text,
    sourceFiles: [],
  })

  useGraphStore.getState().updateGraphMetadata({
    frontmatterMeta: {
      kgCanvas2dRenderer: 'animatic',
      timeline: {
        beats: {
          beat_01: {
            label: 'Opening Revised',
            summary: 'Updated summary',
            note: 'Updated note',
            tags: ['intro', 'hook'],
          },
        },
      },
    } as never,
  })

  const after = useGraphStore.getState()
  const frontmatterMeta = ((after.graphData?.metadata || {}) as Record<string, unknown>).frontmatterMeta as Record<string, unknown> | null
  const timeline = (frontmatterMeta?.timeline || null) as Record<string, unknown> | null
  const beats = (timeline?.beats || null) as Record<string, unknown> | null
  const beat = (beats?.beat_01 || null) as Record<string, unknown> | null
  if (String(beat?.summary || '') !== 'Updated summary') {
    throw new Error(`expected graph metadata timeline beat summary writeback, got ${JSON.stringify(beat)}`)
  }
  const markdownDocumentText = String(after.markdownDocumentText || '')
  for (const snippet of ['timeline:', 'beat_01:', 'label: Opening Revised', 'summary: Updated summary', 'note: Updated note', '- intro', '- hook']) {
    if (!markdownDocumentText.includes(snippet)) {
      throw new Error(`expected active markdown document text to include updated animatic timeline snippet: ${snippet}`)
    }
  }
  if (markdownDocumentText.includes('summary: Original summary')) {
    throw new Error('expected active markdown document text to stop carrying the stale animatic beat summary after graph metadata writeback')
  }
}

export function testAnimaticItemBeatRefNodeWritebackSyncsActiveMarkdownDocument() {
  const text = [
    '---',
    'kgCanvas2dRenderer: animatic',
    'flow:',
    '  nodes:',
    '    - id: {key: id, type: string, value: NODE_AUDIO_01}',
    '      type: {key: type, type: string, value: Audio}',
    '      label: {key: label, type: string, value: Voice}',
    '      params: {key: params, type: object, value: {"beat_ref":"beat_01"}}',
    'timeline:',
    '  beats:',
    '    beat_01:',
    '      label: Opening',
    '    beat_02:',
    '      label: CTA',
    '---',
    '',
  ].join('\n')

  useGraphStore.setState({
    graphData: {
      type: 'Graph',
      context: 'frontmatter-flow',
      metadata: {
        kind: 'frontmatter-flow',
        source: 'markdown:/docs/knowgrph-animatic-demo.md',
        frontmatterMeta: {
          kgCanvas2dRenderer: 'animatic',
          timeline: {
            beats: {
              beat_01: { label: 'Opening' },
              beat_02: { label: 'CTA' },
            },
          },
        },
      },
      nodes: [
        {
          id: 'NODE_AUDIO_01',
          type: 'Audio',
          label: 'Voice',
          properties: {
            params: {
              beat_ref: 'beat_01',
            },
          },
          x: 0,
          y: 0,
        },
      ],
      edges: [],
    } as never,
    graphDataRevision: 1,
    graphContentRevision: 1,
    docLocationRevision: 0,
    markdownDocumentName: '/docs/knowgrph-animatic-demo.md',
    markdownDocumentText: text,
    sourceFiles: [],
  })

  useGraphStore.getState().updateNode('NODE_AUDIO_01', {
    properties: {
      params: {
        beat_ref: 'beat_02',
      },
    } as never,
  })

  const after = useGraphStore.getState()
  const node = after.graphData?.nodes.find(entry => entry.id === 'NODE_AUDIO_01') || null
  const nodeParams = ((node?.properties || {}) as Record<string, unknown>).params as Record<string, unknown> | null
  if (String(nodeParams?.beat_ref || '') !== 'beat_02') {
    throw new Error(`expected graph node beat_ref writeback, got ${JSON.stringify(node?.properties || null)}`)
  }
  const markdownDocumentText = String(after.markdownDocumentText || '')
  if (!markdownDocumentText.includes('{"beat_ref":"beat_02"}')) {
    throw new Error(`expected active markdown document text to include updated flow node beat_ref, got ${markdownDocumentText}`)
  }
  if (markdownDocumentText.includes('{"beat_ref":"beat_01"}')) {
    throw new Error('expected active markdown document text to stop carrying the stale flow node beat_ref after updateNode writeback')
  }
}

export function testPerDocumentUiRestorePrefersFrontmatterFlowLandingContract() {
  const runtimePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'GraphStoreRuntime.tsx')
  const bootstrapRuntimePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'GraphStoreBootstrapRuntime.tsx')
  const debugRuntimePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'GraphStoreMarkdownEmptyTraceDebugRuntime.tsx')
  const documentUiRuntimePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'GraphStoreDocumentUiRuntime.tsx')
  const documentUiRestoreRuntimePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'GraphStoreDocumentUiRestoreRuntime.tsx')
  const documentUiRestoreLifecyclePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'graphStoreDocumentUiRestoreLifecycle.ts')
  const documentUiPersistRuntimePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'GraphStoreDocumentUiPersistRuntime.tsx')
  const documentUiPersistLifecyclePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'graphStoreDocumentUiPersistLifecycle.ts')
  const documentUiPersistStatePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'graphStoreDocumentUiPersistState.ts')
  const documentUiRestoreHelpersPath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'graphStoreDocumentUiRestoreHelpers.ts')
  const documentUiRestorePlanPath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'graphStoreDocumentUiRestorePlan.ts')
  const documentUiRestoreWritesPath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'graphStoreDocumentUiRestoreWrites.ts')
  const documentUiRestoreStatePath = path.resolve(process.cwd(), 'src', 'features', 'canvas', 'graphStoreDocumentUiRestoreState.ts')
  const text = fs.readFileSync(runtimePath, 'utf8')
  const bootstrapText = fs.readFileSync(bootstrapRuntimePath, 'utf8')
  const debugRuntimeText = fs.readFileSync(debugRuntimePath, 'utf8')
  const documentUiText = fs.readFileSync(documentUiRuntimePath, 'utf8')
  const documentUiRestoreText = fs.readFileSync(documentUiRestoreRuntimePath, 'utf8')
  const documentUiRestoreLifecycleText = fs.readFileSync(documentUiRestoreLifecyclePath, 'utf8')
  const documentUiPersistText = fs.readFileSync(documentUiPersistRuntimePath, 'utf8')
  const documentUiPersistLifecycleText = fs.readFileSync(documentUiPersistLifecyclePath, 'utf8')
  const documentUiPersistStateText = fs.readFileSync(documentUiPersistStatePath, 'utf8')
  const documentUiRestoreHelpersText = fs.readFileSync(documentUiRestoreHelpersPath, 'utf8')
  const documentUiRestorePlanText = fs.readFileSync(documentUiRestorePlanPath, 'utf8')
  const documentUiRestoreWritesText = fs.readFileSync(documentUiRestoreWritesPath, 'utf8')
  const documentUiRestoreStateText = fs.readFileSync(documentUiRestoreStatePath, 'utf8')
  if (
    !text.includes('<GraphStoreBootstrapRuntime />')
    || !text.includes('<GraphStoreMarkdownEmptyTraceDebugRuntime />')
    || !text.includes('<GraphStoreDocumentUiRuntime />')
  ) {
    throw new Error('expected GraphStoreRuntime to compose bootstrap, debug trace, and per-document UI runtimes explicitly after the split')
  }
  if (!bootstrapText.includes('ensureSessionTabId()')) {
    throw new Error('expected GraphStoreBootstrapRuntime to keep session tab bootstrap ownership after the split')
  }
  if (!bootstrapText.includes('applyCanvasSliceStorageMigrations()') || !bootstrapText.includes('applyStoryboardWidgetManagerDefaultRegistrySeed()')) {
    throw new Error('expected GraphStoreBootstrapRuntime to keep one-shot storage and registry migrations after the split')
  }
  if (!debugRuntimeText.includes("kg:debug:markdownEmptyTrace")) {
    throw new Error('expected GraphStoreMarkdownEmptyTraceDebugRuntime to own the markdown-empty debug gate after the split')
  }
  if (!debugRuntimeText.includes("__KG_MARKDOWN_EMPTY_TRACE__")) {
    throw new Error('expected GraphStoreMarkdownEmptyTraceDebugRuntime to own the debug trace buffer after the split')
  }
  if (!documentUiText.includes('<GraphStoreDocumentUiRestoreRuntime />')) {
    throw new Error('expected GraphStoreDocumentUiRuntime to keep restore eager through the explicit restore runtime')
  }
  if (!documentUiText.includes('const GraphStoreDocumentUiPersistRuntimeLazy = React.lazy')) {
    throw new Error('expected GraphStoreDocumentUiRuntime to lazy-load per-document UI persistence after the restore split')
  }
  if (!documentUiPersistText.includes("from '@/features/canvas/graphStoreDocumentUiPersistLifecycle'")) {
    throw new Error('expected GraphStoreDocumentUiPersistRuntime to delegate persist lifecycle ownership through the shared persist-lifecycle helper')
  }
  if (!documentUiPersistText.includes('return mountGraphStoreDocumentUiPersistLifecycle()')) {
    throw new Error('expected GraphStoreDocumentUiPersistRuntime to remain a thin lazy shell that delegates lifecycle mounting')
  }
  if (!documentUiPersistLifecycleText.includes('pending = buildPendingDocumentUiPersistStateFromStore(store)')) {
    throw new Error('expected graphStoreDocumentUiPersistLifecycle to build current persisted state through the shared persist-state helper')
  }
  if (!documentUiPersistLifecycleText.includes('pending = buildPendingDocumentUiPersistStateFromSnapshot(next)')) {
    throw new Error('expected graphStoreDocumentUiPersistLifecycle to build incremental persisted state through the shared persist-state helper')
  }
  if (!documentUiPersistLifecycleText.includes('graphStoreDocumentUiRuntimeShared.scheduleCurrentStatePersist = scheduleCurrentStatePersist')) {
    throw new Error('expected graphStoreDocumentUiPersistLifecycle to keep the shared post-restore persistence callback handoff after the split')
  }
  if (!documentUiPersistStateText.includes('export const selectGraphStoreDocumentUiPersistSnapshot')) {
    throw new Error('expected graphStoreDocumentUiPersistState to own persist snapshot shaping after the split')
  }
  if (!documentUiPersistStateText.includes('export const buildPendingDocumentUiPersistStateFromStore')) {
    throw new Error('expected graphStoreDocumentUiPersistState to own current-store pending state derivation after the split')
  }
  if (!documentUiPersistStateText.includes('export const buildPendingDocumentUiPersistSignature')) {
    throw new Error('expected graphStoreDocumentUiPersistState to own persist signature derivation after the split')
  }
  if (!documentUiRestoreText.includes('return mountGraphStoreDocumentUiRestoreLifecycle()')) {
    throw new Error('expected GraphStoreDocumentUiRestoreRuntime to keep a thin eager restore shell that delegates lifecycle mounting')
  }
  if (!documentUiRestoreLifecycleText.includes('applySavedDocumentUiPresentationState(api, saved)')) {
    throw new Error('expected graphStoreDocumentUiRestoreLifecycle to delegate presentation restore through the shared restore helper')
  }
  if (!documentUiRestoreLifecycleText.includes('applySavedDocumentUiSelectionState(api, saved)')) {
    throw new Error('expected graphStoreDocumentUiRestoreLifecycle to delegate selection replay through the shared restore helper')
  }
  if (!documentUiRestoreLifecycleText.includes('graphStoreDocumentUiRuntimeShared.scheduleCurrentStatePersist?.()')) {
    throw new Error('expected graphStoreDocumentUiRestoreLifecycle to keep the post-restore persistence handoff after the split')
  }
  if (!documentUiRestoreHelpersText.includes('applyFrontmatterFlowImportModes(graphData)')) {
    throw new Error('expected per-document UI restore helpers to reuse shared frontmatter-flow landing helper')
  }
  if (!documentUiRestoreHelpersText.includes('const preset = resolveCanvasFrontmatterPreset({ graphData, rawText })')) {
    throw new Error('expected per-document UI restore to resolve explicit frontmatter workspace presets before saved ui state')
  }
  if (!documentUiRestoreHelpersText.includes('if (preset) {')) {
    throw new Error('expected saved canvas/ui restore to be skipped when an explicit frontmatter workspace preset is present')
  }
  if (!documentUiRestoreHelpersText.includes('const viewState = buildSavedDocumentUiViewState(saved)')) {
    throw new Error('expected per-document UI restore helpers to consume normalized view state before applying restore writes')
  }
  if (!documentUiRestoreHelpersText.includes('applySavedDocumentUiViewStateWrites(api, viewState)')) {
    throw new Error('expected per-document UI restore helpers to apply normalized view state through the dedicated restore write helper')
  }
  if (!documentUiRestoreHelpersText.includes('const selectionState = buildSavedDocumentUiSelectionState(saved)')) {
    throw new Error('expected per-document UI restore helpers to consume normalized selection state before applying selection replay')
  }
  if (!documentUiRestoreHelpersText.includes('applySavedDocumentUiSelectionStateWrites(api, selectionState)')) {
    throw new Error('expected per-document UI restore helpers to apply normalized selection state through the dedicated restore write helper')
  }
  if (!documentUiRestoreHelpersText.includes('const presentationPlan = buildSavedDocumentUiPresentationPlan({ graphData, saved })')) {
    throw new Error('expected per-document UI restore helpers to consume a shared presentation restore plan before applying writes')
  }
  if (!documentUiRestoreHelpersText.includes('applySavedDocumentUiModeStateWrites(api, presentationPlan.modeState)')) {
    throw new Error('expected per-document UI restore helpers to apply saved mode state through the dedicated restore write helper')
  }
  if (!documentUiRestorePlanText.includes('export function buildSavedDocumentUiPresentationPlan')) {
    throw new Error('expected graphStoreDocumentUiRestorePlan to own presentation restore planning after the split')
  }
  if (!documentUiRestorePlanText.includes('shouldPreferFrontmatterFlowLanding: isFrontmatterFlowGraph(args.graphData)')) {
    throw new Error('expected graphStoreDocumentUiRestorePlan to own the frontmatter landing decision after the split')
  }
  if (!documentUiRestorePlanText.includes('export function buildSavedDocumentUiModeState')) {
    throw new Error('expected graphStoreDocumentUiRestorePlan to own normalized saved mode-state derivation after the split')
  }
  if (!documentUiRestoreWritesText.includes('export function applySavedDocumentUiModeStateWrites')) {
    throw new Error('expected graphStoreDocumentUiRestoreWrites to own saved mode-state restore writes after the split')
  }
  if (!documentUiRestoreWritesText.includes('api.setDocumentSemanticMode(modeState.documentSemanticMode)')) {
    throw new Error('expected graphStoreDocumentUiRestoreWrites to own document semantic mode writes after the split')
  }
  if (!documentUiRestoreWritesText.includes('export function applySavedDocumentUiViewStateWrites')) {
    throw new Error('expected graphStoreDocumentUiRestoreWrites to own normalized view-state restore writes after the split')
  }
  if (!documentUiRestoreWritesText.includes('api.setViewPinned(viewState.pinned)')) {
    throw new Error('expected graphStoreDocumentUiRestoreWrites to own pinned view restore writes after the split')
  }
  if (!documentUiRestoreWritesText.includes('export function applySavedDocumentUiSelectionStateWrites')) {
    throw new Error('expected graphStoreDocumentUiRestoreWrites to own normalized selection replay writes after the split')
  }
  if (!documentUiRestoreWritesText.includes("api.selectNodesExpanded({")) {
    throw new Error('expected graphStoreDocumentUiRestoreWrites to own expanded selection replay writes after the split')
  }
  if (!documentUiRestoreStateText.includes('export function buildSavedDocumentUiViewState')) {
    throw new Error('expected graphStoreDocumentUiRestoreState to own normalized view-state derivation after the split')
  }
  if (!documentUiRestoreStateText.includes('export function buildSavedDocumentUiSelectionState')) {
    throw new Error('expected graphStoreDocumentUiRestoreState to own normalized selection-state derivation after the split')
  }
  if (!documentUiRestoreStateText.includes('hasSelection: nodeIds.length > 0 || edgeIds.length > 0 || groupIds.length > 0')) {
    throw new Error('expected graphStoreDocumentUiRestoreState to own selection presence normalization after the split')
  }
}

export function testInitializationWorkspaceSelectionPromotesAtomicGraphAndPresetLanding() {
  const documentActionsPath = path.resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataDocumentActions.ts')
  const indexingPath = path.resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceIndexing.tsx')
  const runtimeIoPath = path.resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'markdownWorkspaceRuntime.io.ts')

  const documentActionsText = fs.readFileSync(documentActionsPath, 'utf8')
  const indexingText = fs.readFileSync(indexingPath, 'utf8')
  const runtimeIoText = fs.readFileSync(runtimeIoPath, 'utf8')

  if (
    !documentActionsText.includes('const shouldResolveCanvasPreset =') ||
    !documentActionsText.includes('shouldApplyExplicitCanvasPreset') ||
    !documentActionsText.includes('args?.applyViewPreset !== false') ||
    !documentActionsText.includes('args?.applyToGraph === true') ||
    !documentActionsText.includes('hasProvidedCanvasPreset ? args.canvasWorkspacePreset ?? null : parseCanvasWorkspaceFrontmatterPreset(text)') ||
    !documentActionsText.includes('preset: parsedTextPreset')
  ) {
    throw new Error('expected active markdown document switching to resolve and reuse frontmatter presets for graph applies')
  }
  if (indexingText.includes('frontmatterLanding') || indexingText.includes('resolveMarkdownWorkspaceFrontmatterLanding')) {
    throw new Error('expected workspace indexing to keep Source Files switches passive instead of frontmatter-driven Canvas relanding')
  }
  if (indexingText.includes('applyViewPreset: true') || indexingText.includes('applyToGraph: true') || indexingText.includes('forceApplyToGraph: true')) {
    throw new Error('expected Source Files indexing not to mutate Canvas graph/view state while switching files')
  }
  if (!indexingText.includes('applyViewPreset: false') || !indexingText.includes('normalizeWebpageFrontmatterToMarkdown: false')) {
    throw new Error('expected Source Files indexing to sync active markdown text passively without frontmatter normalization churn')
  }
  if (indexingText.includes("rememberIndexedForPath(path, textHash)\n              args.setStatusWithAutoClear('Indexed')\n              return")) {
    throw new Error('expected initialization-file landing to continue through source-file indexing instead of returning before content/view sync completes')
  }
  if (!runtimeIoText.includes('applyViewPreset: args.applyViewPreset ?? false')) {
    throw new Error('expected shared workspace active-document refresh helper to remain passive unless callers opt into preset landing')
  }
}

export async function testInitializationWorkspaceMaterializationPreservesCanonicalDocumentGraph() {
  const { restore } = initJsdomHarness()
  const previousRaf = typeof window !== 'undefined' ? window.requestAnimationFrame : undefined
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setDocumentStructureBaselineLock(false)
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      }) as typeof window.requestAnimationFrame
    }

    const readmeText = [
      '---',
      'title: "Document Validation"',
      'kgCanvasSurfaceMode: "2d"',
      'kgCanvasRenderMode: "2d"',
      'kgCanvas2dRenderer: "d3"',
      'kgDocumentSemanticMode: "document"',
      'kgFrontmatterModeEnabled: true',
      'kgDocumentStructureBaselineLock: false',
      '---',
      '',
      '# Document Validation',
    ].join('\n')
    const storyboardWidgetText = createStoryboardPresetMarkdown({ includeFlowGraph: true })
    const geospatialText = createGeospatialPresetMarkdown()
    const workspaceFs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/README.md', parentPath: '/', kind: 'file', name: 'README.md', text: readmeText, updatedAtMs: 1 },
        {
          path: STORYBOARD_WIDGET_VALIDATION_WORKSPACE_PATH,
          parentPath: '/',
          kind: 'file',
          name: STORYBOARD_WIDGET_VALIDATION_BASENAME,
          text: storyboardWidgetText,
          updatedAtMs: 2,
        },
        {
          path: GEOSPATIAL_VALIDATION_WORKSPACE_PATH,
          parentPath: '/',
          kind: 'file',
          name: GEOSPATIAL_VALIDATION_BASENAME,
          text: geospatialText,
          updatedAtMs: 3,
        },
      ],
    })
    const workspaceEntries = await workspaceFs.listEntries()

    await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: STORYBOARD_WIDGET_VALIDATION_WORKSPACE_PATH,
      fs: workspaceFs,
      workspaceEntries,
      sourcesByPath: {},
      applyToGraph: true,
    })

    const afterStoryboard = useGraphStore.getState()
    if (afterStoryboard.canvas2dRenderer !== 'storyboard') {
      throw new Error(`expected Storyboard initialization materialization to preserve Storyboard landing, got ${String(afterStoryboard.canvas2dRenderer)}`)
    }
    if ((afterStoryboard.graphData?.nodes || []).some(node => String(node?.id || '').includes('::'))) {
      throw new Error('expected Storyboard initialization materialization to preserve canonical parsed graph ids instead of composed source-layer ids')
    }

    await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: '/README.md',
      fs: workspaceFs,
      workspaceEntries,
      sourcesByPath: {},
      applyToGraph: true,
    })

    const afterReadme = useGraphStore.getState()
    if (afterReadme.canvas2dRenderer !== 'd3') {
      throw new Error(`expected README initialization materialization to preserve d3 landing, got ${String(afterReadme.canvas2dRenderer)}`)
    }
    if ((afterReadme.graphData?.nodes || []).some(node => String(node?.id || '').includes('::'))) {
      throw new Error('expected README initialization materialization to preserve canonical parsed graph ids instead of composed source-layer ids')
    }

    await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: GEOSPATIAL_VALIDATION_WORKSPACE_PATH,
      fs: workspaceFs,
      workspaceEntries,
      sourcesByPath: {},
      applyToGraph: true,
    })

    const afterGeospatial = useGraphStore.getState()
    if (afterGeospatial.canvas2dRenderer !== 'storyboard') {
      throw new Error(`expected geospatial initialization materialization to preserve Storyboard landing, got ${String(afterGeospatial.canvas2dRenderer)}`)
    }
    if (afterGeospatial.canvasRenderMode !== '2d') {
      throw new Error(`expected geospatial initialization materialization to preserve 2d surface mode, got ${String(afterGeospatial.canvasRenderMode)}`)
    }
    if (afterGeospatial.frontmatterModeEnabled !== true) {
      throw new Error('expected geospatial initialization materialization to preserve frontmatter mode')
    }
    if (!lsBool(LS_KEYS.geospatialOverlayEnabled, false)) {
      throw new Error('expected geospatial initialization materialization to enable geospatial surface mode')
    }
  } finally {
    if (typeof window !== 'undefined' && previousRaf) {
      window.requestAnimationFrame = previousRaf
    }
    restore()
  }
}

export function testFrontmatterIngestPipelineDefersPresetReplayUntilGraphApply() {
  const loaderPath = path.resolve(process.cwd(), 'src', 'features', 'parsers', 'loader.ts')
  const importModesPath = path.resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'applyWorkspaceImportToCanvas.ts')
  const loaderText = fs.readFileSync(loaderPath, 'utf8')
  const importModesText = fs.readFileSync(importModesPath, 'utf8')

  if (!loaderText.includes('applyViewPreset: false')) {
    throw new Error('expected parser loader markdown sync to stay passive before graph hydration')
  }
  if (loaderText.includes('applyFrontmatterFlowImportModes(') || loaderText.includes('applyCanvasFrontmatterPreset({')) {
    throw new Error('expected parser loader to avoid Canvas/frontmatter layout replay during passive markdown sync')
  }
  if (importModesText.includes('const presetApplied = applyCanvasFrontmatterPreset({ rawText })')) {
    throw new Error('expected interactive import modes to stop replaying raw frontmatter presets before graph-aware import landing runs')
  }
  if (!importModesText.includes('const hasCanvasFrontmatterPresetInHeader = !!frontmatterHeaderText && !!parseCanvasWorkspaceFrontmatterPreset(frontmatterHeaderText)')) {
    throw new Error('expected workspace import pipeline to detect explicit canvas frontmatter presets from the YAML header hot path')
  }
  if (!importModesText.includes("} else if (!preferredInteractiveImportGraphData && graphData && hasCanvasFrontmatterPreset) {")) {
    throw new Error('expected workspace import pipeline to preserve frontmatter-driven canvas landing for parsed non-frontmatter-flow graphs')
  }
}

export function testWorkspaceInitializationSeedDefaultsStayRepoNeutral() {
  const workspaceFsPath = path.resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'workspaceFs.ts')
  const text = fs.readFileSync(workspaceFsPath, 'utf8')
  if (text.includes("'VITE_WORKSPACE_INITIALIZATION_DOCS_ROOT_REL_PATH',\n  'huijoohwee/docs'")) {
    throw new Error('expected workspace initialization seed defaults to avoid sibling-repo hardcoded docs root')
  }
  if (!text.includes("const DEFAULT_WORKSPACE_INITIALIZATION_SEED_ROOT_REL_PATHS = ['docs/workspace-seeds', 'docs'] as const")) {
    throw new Error('expected workspace initialization seed defaults to prefer repo-local docs paths')
  }
  if (!text.includes('buildInitializationSeedRelPathCandidates')) {
    throw new Error('expected workspace initialization seed loader to support ordered candidate paths with fallback')
  }
}
