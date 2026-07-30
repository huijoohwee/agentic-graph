import React from 'react'

import { coerceJsonObject, tryParseJson } from '@/components/StoryboardWidget/storyboardWidgetJson'
import { useGraphStore } from '@/hooks/useGraphStore'
import { normalizeGraphData } from '@/lib/graph/normalize'
import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import {
  FLOW_EDGE_DISPLAY_LABEL_KEY,
  FLOW_EDGE_SOURCE_PORT_KEY,
  FLOW_EDGE_TARGET_PORT_KEY,
  FLOW_SCHEMA_FIELDS_PROPERTY_KEY,
  buildFlowEdgeDisplayLabelFromPorts,
  buildSchemaFieldPortKey,
} from '@/lib/graph/flowPorts'
import {
  convertNodeToLoopInGraphData,
  enableHandlesForAllInputsInSchema,
  isHandlesForAllInputsEnabled,
} from '@/lib/storyboardWidget/storyboardWidgetActions'
import { UI_COPY, STORYBOARD_WIDGET_SMART_NODE_REQUIRED_FIELDS, FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, FLOW_TEXT_GENERATION_NODE_TYPE_ID } from '@/lib/config'
import { clearRichMediaOutputProperties, resolveRichMediaWidgetKind } from '@/features/chat/richMediaRun'
import { createUniqueId } from '@/lib/ids'
import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'
import { readGraphDataRevision } from '@/lib/graph/documentMetadata'
import {
  isCanonicalNodeIdEqual,
  resolveGraphDataAndNodeByCanonicalId,
  resolveGraphNodeByCanonicalId,
} from '@/lib/graph/canonicalNodeIds'

export function resolveStoryboardWidgetNodeMutationTarget(args: {
  baseGraphData: GraphData | null
  draftGraphData: GraphData | null
  latestDraftGraphData: GraphData | null
  nodeId: string
  sourceGraphData?: GraphData | null
  storeGraphData: GraphData | null
}) {
  return resolveGraphDataAndNodeByCanonicalId([
    args.latestDraftGraphData,
    args.draftGraphData,
    args.sourceGraphData,
    args.baseGraphData,
    args.storeGraphData,
  ], args.nodeId)
}

export function deriveStoryboardWidgetNodeRemoval(args: {
  graphData: GraphData | null | undefined
  nodeId: unknown
}): {
  nextGraphData: GraphData | null
  removedNodeIds: string[]
} {
  const graphData = args.graphData
  const id = String(args.nodeId || '').trim()
  if (!graphData || !id) {
    return { nextGraphData: graphData || null, removedNodeIds: [] }
  }
  const resolvedId = String(resolveGraphNodeByCanonicalId(graphData, id)?.id || '').trim()
  const targetIds = [id, resolvedId].filter(Boolean)
  const shouldRemoveId = (rawId: unknown): boolean => targetIds.some(targetId => isCanonicalNodeIdEqual(rawId, targetId))
  const removedNodeIds: string[] = []
  const nextNodes = (graphData.nodes || []).filter(node => {
    const nodeId = String(node.id || '').trim()
    if (!shouldRemoveId(nodeId)) return true
    removedNodeIds.push(nodeId)
    return false
  })
  if (removedNodeIds.length === 0) {
    return { nextGraphData: graphData, removedNodeIds: [] }
  }
  const nextEdges = (graphData.edges || []).filter(edge => {
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    return !!src && !!tgt && !shouldRemoveId(src) && !shouldRemoveId(tgt)
  })
  return {
    nextGraphData: normalizeGraphData({ ...graphData, nodes: nextNodes, edges: nextEdges }),
    removedNodeIds,
  }
}

export function isStoryboardWidgetNodeRemovalTarget(args: {
  nodeId: unknown
  removalNodeIds: ReadonlyArray<string>
}): boolean {
  const id = String(args.nodeId || '').trim()
  if (!id) return false
  return args.removalNodeIds.some(removalNodeId => isCanonicalNodeIdEqual(id, removalNodeId))
}

export function useStoryboardWidgetNodeDraftActions(args: {
  active: boolean
  draftGraphData: GraphData | null
  draftGraphDataRef: React.MutableRefObject<GraphData | null>
  setDraftGraphData: React.Dispatch<React.SetStateAction<GraphData | null>>
  baseGraphData: GraphData | null
  selectedNodeId: string | null
  selectedEdgeId: string | null
  documentStructureBaselineLock: boolean
  schema: any
  setSchema: (schema: any) => void
  addNode: (node: GraphNode) => void
  updateNode: (id: string, patch: Partial<GraphNode>) => void
  updateEdge: (id: string, patch: Record<string, unknown>) => void
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
  setSelectionSource: (src: 'canvas' | 'menu' | 'toolbar' | 'editor' | 'unknown') => void
  setGraphDataPreservingLayout: (next: GraphData) => void
  updateOpenWidgetNodeIds: (updater: (prev: string[]) => string[]) => void
  persistCommittedNodeProperties?: (graphData: GraphData) => void
  onNodePropertiesCommittedForAutoRun?: (nodeId: string, changedPropertyKeys?: ReadonlyArray<string>) => void
  upsertUiToast: (args: { id: string; kind: 'neutral' | 'warning' | 'success' | 'error'; message: string; ttlMs?: number }) => void
  nodePropsJson: string
  nodeMetaJson: string
  edgePropsJson: string
  edgeMetaJson: string
  workflowMetaJson: string
  workflowContextJson: string
  setJsonError: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const readDraftMutationRevisionFloor = React.useCallback((): number => {
    const storeGraphData = useGraphStore.getState().graphData as GraphData | null
    return Math.max(
      readGraphDataRevision(args.baseGraphData),
      readGraphDataRevision(args.draftGraphData),
      readGraphDataRevision(args.draftGraphDataRef.current),
      readGraphDataRevision(storeGraphData),
    )
  }, [args.baseGraphData, args.draftGraphData, args.draftGraphDataRef])

  const updateNodeById = React.useCallback((nodeId: string, patch: Partial<GraphNode>, sourceGraphData?: GraphData | null) => {
    const id = String(nodeId || '').trim()
    if (!id) return
    const storeGraphData = useGraphStore.getState().graphData as GraphData | null
    const storeNodeId = String(resolveGraphNodeByCanonicalId(storeGraphData, id)?.id || '').trim()
    const draft = resolveStoryboardWidgetNodeMutationTarget({
      baseGraphData: args.baseGraphData,
      draftGraphData: args.draftGraphData,
      latestDraftGraphData: args.draftGraphDataRef.current,
      nodeId: id,
      sourceGraphData,
      storeGraphData,
    })?.graphData || null
    let nextDraft: GraphData | null = null
    if (draft && Array.isArray(draft.nodes)) {
      let changed = false
      const nodes = draft.nodes.map(node => {
        if (!isCanonicalNodeIdEqual(node.id, id)) return node
        changed = true
        return { ...node, ...patch }
      })
      if (changed) {
        nextDraft = bumpStoryboardWidgetDraftGraphDataRevision(
          normalizeGraphData({ ...draft, nodes }),
          { revisionFloor: readDraftMutationRevisionFloor() },
        )
        args.draftGraphDataRef.current = nextDraft
      }
    }
    args.updateNode(storeNodeId || id, patch)
    if (nextDraft) args.setDraftGraphData(nextDraft)
    return nextDraft
  }, [args, readDraftMutationRevisionFloor])

  const removeNodeById = React.useCallback((nodeId: string) => {
    const id = String(nodeId || '').trim()
    const graphDataForRemoval = (args.draftGraphDataRef.current || args.draftGraphData || args.baseGraphData) as GraphData | null
    if (!id) return
    const removal = deriveStoryboardWidgetNodeRemoval({ graphData: graphDataForRemoval, nodeId: id })
    if (removal.removedNodeIds.length > 0 && removal.nextGraphData) {
      args.draftGraphDataRef.current = bumpStoryboardWidgetDraftGraphDataRevision(
        removal.nextGraphData,
        { revisionFloor: readDraftMutationRevisionFloor() },
      )
      args.setDraftGraphData(args.draftGraphDataRef.current)
      args.setGraphDataPreservingLayout(args.draftGraphDataRef.current)
    }
    const idsForOpenWidgetClose = removal.removedNodeIds.length > 0 ? removal.removedNodeIds : [id]
    args.updateOpenWidgetNodeIds(prev => prev.filter(x => !isStoryboardWidgetNodeRemovalTarget({ nodeId: x, removalNodeIds: idsForOpenWidgetClose })))
    if (isStoryboardWidgetNodeRemovalTarget({ nodeId: useGraphStore.getState().selectedNodeId, removalNodeIds: idsForOpenWidgetClose })) {
      args.setSelectionSource('canvas')
      args.selectNode(null)
      args.selectEdge(null)
    }
  }, [args, readDraftMutationRevisionFloor])

  const clearNodeOutputById = React.useCallback((nodeId: string) => {
    const id = String(nodeId || '').trim()
    if (!id) return
    const draft = (args.draftGraphDataRef.current || args.draftGraphData) as GraphData | null
    const node = (draft?.nodes || []).find(n => String(n.id || '') === id) || null
    if (!node) return
    const nextProperties = clearRichMediaOutputProperties((node.properties || {}) as Record<string, unknown>)
    const kind = resolveRichMediaWidgetKind(node)
    if (kind || String(node.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) {
      updateNodeById(id, { properties: nextProperties as never })
      args.upsertUiToast({ id: `storyboard-widget-clear-output-${id}`, kind: 'neutral', message: kind ? `Cleared ${kind} output.` : 'Cleared rich media panel output.', ttlMs: 2200 })
      return
    }
    if (String(node.type || '').trim() === FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
      updateNodeById(id, { properties: nextProperties as never })
      args.upsertUiToast({ id: `storyboard-widget-clear-output-${id}`, kind: 'neutral', message: 'Cleared text output.', ttlMs: 2200 })
      return
    }
    updateNodeById(id, { properties: nextProperties as never })
    args.upsertUiToast({ id: `storyboard-widget-clear-output-${id}`, kind: 'neutral', message: 'Reset workflow output.', ttlMs: 2200 })
  }, [args, updateNodeById])

  const setNodeLabelById = React.useCallback((nodeId: string, label: string) => {
    const id = String(nodeId || '').trim()
    if (id) updateNodeById(id, { label: String(label || '') })
  }, [updateNodeById])

  const setSelectedNodeLabel = React.useCallback((label: string) => {
    if (args.selectedNodeId) setNodeLabelById(args.selectedNodeId, label)
  }, [args.selectedNodeId, setNodeLabelById])

  const setNodeTypeById = React.useCallback((nodeId: string, type: string) => {
    const id = String(nodeId || '').trim()
    if (id) updateNodeById(id, { type: String(type || '').trim() || 'Node' })
  }, [updateNodeById])

  const setSelectedNodeType = React.useCallback((type: string) => {
    if (args.selectedNodeId) setNodeTypeById(args.selectedNodeId, type)
  }, [args.selectedNodeId, setNodeTypeById])

  const patchNodePropertiesById = React.useCallback((nodeId: string, patch: Record<string, unknown>, sourceGraphData?: GraphData | null) => {
    const id = String(nodeId || '').trim()
    if (!id) return
    const resolved = resolveStoryboardWidgetNodeMutationTarget({
      baseGraphData: args.baseGraphData,
      draftGraphData: args.draftGraphData,
      latestDraftGraphData: args.draftGraphDataRef.current,
      nodeId: id,
      sourceGraphData,
      storeGraphData: useGraphStore.getState().graphData as GraphData | null,
    })
    const node = resolved?.node || null
    if (!node) return
    const prevProps = (node.properties || {}) as Record<string, unknown>
    const nextProps: Record<string, unknown> = { ...prevProps }
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === 'undefined') delete nextProps[key]
      else nextProps[key] = value
    }
    const changedPropertyKeys = Object.keys(patch)
      .map(key => String(key || '').trim())
      .filter(key => {
        if (!key) return false
        const prevValue = prevProps[key]
        const nextValue = nextProps[key]
        return !Object.is(prevValue, nextValue)
      })
    const nextDraft = updateNodeById(id, { properties: nextProps as never }, resolved?.graphData || sourceGraphData)
    if (nextDraft && changedPropertyKeys.length > 0) args.persistCommittedNodeProperties?.(nextDraft)
    args.onNodePropertiesCommittedForAutoRun?.(id, changedPropertyKeys)
  }, [args, updateNodeById])

  const patchSelectedNodeProperties = React.useCallback((patch: Record<string, unknown>) => {
    if (!args.selectedNodeId) return
    patchNodePropertiesById(args.selectedNodeId, patch)
  }, [args.selectedNodeId, patchNodePropertiesById])

  const renameSchemaFieldIdByNodeId = React.useCallback((nodeId: string, prevId: string, nextId: string) => {
    const id = String(nodeId || '').trim()
    const from = String(prevId || '').trim()
    const to = String(nextId || '').trim()
    if (!id || !from || !to || from === to || !args.draftGraphData) return
    const prevPort = buildSchemaFieldPortKey(from)
    const nextPort = buildSchemaFieldPortKey(to)
    const nodeById = new Map((args.draftGraphData.nodes || []).map(n => [String(n.id || ''), n] as const))
    const rawNode = nodeById.get(id) || null
    const rawProps = (rawNode?.properties || {}) as Record<string, JSONValue>
    const rawFields = rawProps[FLOW_SCHEMA_FIELDS_PROPERTY_KEY]
    const patchedFields = Array.isArray(rawFields)
      ? rawFields.map(item => {
          if (typeof item === 'string') return (item === from ? to : item) as JSONValue
          if (!item || typeof item !== 'object' || Array.isArray(item)) return item as JSONValue
          const rec = item as Record<string, JSONValue>
          const nextRec: Record<string, JSONValue> = { ...rec }
          if (typeof nextRec.id === 'string' && nextRec.id.trim() === from) nextRec.id = to
          if (typeof nextRec.title === 'string' && nextRec.title.trim() === from) nextRec.title = to
          return nextRec as unknown as JSONValue
        })
      : rawFields
    const patchedNodeForLabel: Pick<GraphNode, 'properties'> | null = rawNode ? { properties: { ...rawProps, [FLOW_SCHEMA_FIELDS_PROPERTY_KEY]: patchedFields as JSONValue } } : null
    let anyEdgeUpdated = false
    const nextEdges = (args.draftGraphData.edges || []).map(edge => {
      const isSource = String(edge.source || '') === id
      const isTarget = String(edge.target || '') === id
      if (!isSource && !isTarget) return edge
      const prevProps = (edge.properties || {}) as Record<string, unknown>
      const curSourcePort = String(prevProps[FLOW_EDGE_SOURCE_PORT_KEY] || '')
      const curTargetPort = String(prevProps[FLOW_EDGE_TARGET_PORT_KEY] || '')
      const nextSourcePort = isSource && curSourcePort === prevPort ? nextPort : curSourcePort
      const nextTargetPort = isTarget && curTargetPort === prevPort ? nextPort : curTargetPort
      if (nextSourcePort === curSourcePort && nextTargetPort === curTargetPort) return edge
      anyEdgeUpdated = true
      const nextProps: Record<string, unknown> = { ...prevProps, [FLOW_EDGE_SOURCE_PORT_KEY]: nextSourcePort, [FLOW_EDGE_TARGET_PORT_KEY]: nextTargetPort }
      const sourceNode = String(edge.source || '') === id ? patchedNodeForLabel : nodeById.get(String(edge.source || '')) || null
      const targetNode = String(edge.target || '') === id ? patchedNodeForLabel : nodeById.get(String(edge.target || '')) || null
      const displayLabel = buildFlowEdgeDisplayLabelFromPorts({ sourceNode, targetNode, sourcePortKey: nextSourcePort, targetPortKey: nextTargetPort })
      if (displayLabel) nextProps[FLOW_EDGE_DISPLAY_LABEL_KEY] = displayLabel
      else delete nextProps[FLOW_EDGE_DISPLAY_LABEL_KEY]
      return { ...edge, properties: nextProps as never }
    })
    if (anyEdgeUpdated) args.setGraphDataPreservingLayout(normalizeGraphData({ ...args.draftGraphData, edges: nextEdges }))
  }, [args])

  const setNodePropertiesById = React.useCallback((nodeId: string, properties: Record<string, unknown>) => {
    const id = String(nodeId || '').trim()
    if (!id) return
    const cur = args.draftGraphDataRef.current || args.draftGraphData || useGraphStore.getState().graphData
    const node = cur?.nodes?.find(n => String(n.id || '') === id) || null
    const prevProps = (node?.properties || {}) as Record<string, unknown>
    const nextProps = (properties || {}) as Record<string, unknown>
    const keySet = new Set([...Object.keys(prevProps), ...Object.keys(nextProps)])
    const changedPropertyKeys = Array.from(keySet).filter(key => !Object.is(prevProps[key], nextProps[key]))
    const nextDraft = updateNodeById(id, { properties: nextProps as never })
    if (nextDraft && changedPropertyKeys.length > 0) args.persistCommittedNodeProperties?.(nextDraft)
    args.onNodePropertiesCommittedForAutoRun?.(id, changedPropertyKeys)
  }, [args, updateNodeById])

  const validateNodeById = React.useCallback((nodeId: string) => {
    const id = String(nodeId || '').trim()
    if (!id || !args.draftGraphData) return
    const node = (args.draftGraphData.nodes || []).find(n => String(n.id || '') === id) || null
    if (!node) return
    const props = (node.properties || {}) as Record<string, unknown>
    const missing: string[] = []
    for (const key of STORYBOARD_WIDGET_SMART_NODE_REQUIRED_FIELDS) {
      const v = props[key]
      if (key === 'duration') {
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) missing.push(String(key))
      } else if (typeof v === 'string') {
        if (v.trim().length === 0) missing.push(String(key))
      } else if (typeof v === 'undefined' || v === null) {
        missing.push(String(key))
      }
    }
    if (missing.length > 0) {
      args.upsertUiToast({ id: `storyboard-widget-node-validate-${id}`, kind: 'warning', message: `Missing required fields: ${missing.join(', ')}`, ttlMs: 4500 })
      return
    }
    args.upsertUiToast({ id: `storyboard-widget-node-validate-${id}`, kind: 'success', message: 'Node validated.', ttlMs: 2500 })
  }, [args])

  const duplicateNodeById = React.useCallback((nodeId: string) => {
    const id = String(nodeId || '').trim()
    if (!id || !args.draftGraphData) return
    const nodes = Array.isArray(args.draftGraphData.nodes) ? args.draftGraphData.nodes : []
    const source = nodes.find(n => String(n.id || '') === id) || null
    if (!source) return
    const nextId = createUniqueId('n', new Set(nodes.map(n => String(n.id || '')).filter(Boolean)))
    const baseLabel = String(source.label || source.id || nextId)
    const nextNode: GraphNode = { ...source, id: nextId, label: `${baseLabel} copy`, x: (Number.isFinite(source.x) ? source.x : 0) + 40, y: (Number.isFinite(source.y) ? source.y : 0) + 40 }
    args.setGraphDataPreservingLayout(normalizeGraphData({ ...args.draftGraphData, nodes: [...nodes, nextNode] }))
    args.updateOpenWidgetNodeIds(prev => (prev.includes(nextId) ? prev : [...prev, nextId]))
    args.setSelectionSource('canvas')
    args.selectEdge(null)
    args.selectNode(nextId)
  }, [args])

  const showNodeEditorHelp = React.useCallback(() => {
    args.upsertUiToast({ id: 'storyboard-widget-node-editor-help', kind: 'neutral', message: UI_COPY.flowWidgetHelpToast, ttlMs: 2800 })
  }, [args])

  const enableHandlesForAllInputs = React.useCallback(() => {
    if (args.documentStructureBaselineLock === true) {
      args.upsertUiToast({ id: 'baseline-locked', kind: 'warning', message: UI_COPY.baselineLockedToast, ttlMs: 6000 })
      return
    }
    if (isHandlesForAllInputsEnabled(args.schema)) {
      args.upsertUiToast({ id: 'storyboard-widget-enable-handles', kind: 'neutral', message: UI_COPY.flowWidgetEnableHandlesAlreadyOnToast, ttlMs: 2200 })
      return
    }
    const next = enableHandlesForAllInputsInSchema(args.schema)
    if (next.changed) args.setSchema(next.schema)
    args.upsertUiToast({ id: 'storyboard-widget-enable-handles', kind: 'success', message: UI_COPY.flowWidgetEnableHandlesToast, ttlMs: 2600 })
  }, [args])

  const convertNodeToLoopById = React.useCallback((nodeId: string) => {
    const id = String(nodeId || '').trim()
    if (!id || !args.draftGraphData) return
    const converted = convertNodeToLoopInGraphData(args.draftGraphData, id)
    if (!converted.changed) {
      args.upsertUiToast({ id: 'storyboard-widget-convert-loop', kind: 'neutral', message: UI_COPY.flowWidgetConvertToLoopAlreadyLoopToast, ttlMs: 2200 })
      return
    }
    args.setGraphDataPreservingLayout(converted.graphData)
    args.upsertUiToast({ id: 'storyboard-widget-convert-loop', kind: 'success', message: UI_COPY.flowWidgetConvertToLoopToast, ttlMs: 2600 })
  }, [args])

  const setSelectedEdgeLabel = React.useCallback((label: string) => {
    if (!args.selectedEdgeId) return
    args.updateEdge(args.selectedEdgeId, { label: String(label || '').trim() || 'linksTo' })
  }, [args])

  const applyJsonToDraft = React.useCallback((nextArgs: { target: 'nodeProps' | 'nodeMeta' | 'edgeProps' | 'edgeMeta' | 'workflowMeta' | 'workflowContext' }) => {
    if (!args.draftGraphData) return
    args.setJsonError(null)
    const apply = (next: GraphData) => args.setGraphDataPreservingLayout(normalizeGraphData(next))
    if (nextArgs.target === 'workflowContext') {
      const parsed = tryParseJson(args.workflowContextJson)
      if (parsed.ok === false) return void args.setJsonError(parsed.error)
      apply({ ...args.draftGraphData, context: parsed.value as never }); return
    }
    if (nextArgs.target === 'workflowMeta') {
      const parsed = tryParseJson(args.workflowMetaJson)
      if (parsed.ok === false) return void args.setJsonError(parsed.error)
      const record = coerceJsonObject(parsed.value)
      if (!record) return void args.setJsonError('Workflow metadata must be a JSON object.')
      apply({ ...args.draftGraphData, metadata: record as never }); return
    }
    if (nextArgs.target === 'nodeProps' || nextArgs.target === 'nodeMeta') {
      if (!args.selectedNodeId) return
      const parsed = tryParseJson(nextArgs.target === 'nodeProps' ? args.nodePropsJson : args.nodeMetaJson)
      if (parsed.ok === false) return void args.setJsonError(parsed.error)
      const record = coerceJsonObject(parsed.value)
      if (!record) return void args.setJsonError('Node value must be a JSON object.')
      args.updateNode(args.selectedNodeId, nextArgs.target === 'nodeProps' ? { properties: record as never } : { metadata: record as never }); return
    }
    if (nextArgs.target === 'edgeProps' || nextArgs.target === 'edgeMeta') {
      if (!args.selectedEdgeId) return
      const parsed = tryParseJson(nextArgs.target === 'edgeProps' ? args.edgePropsJson : args.edgeMetaJson)
      if (parsed.ok === false) return void args.setJsonError(parsed.error)
      const record = coerceJsonObject(parsed.value)
      if (!record) return void args.setJsonError('Edge value must be a JSON object.')
      args.updateEdge(args.selectedEdgeId, nextArgs.target === 'edgeProps' ? { properties: record as never } : { metadata: record as never })
    }
  }, [args])

  return {
    applyJsonToDraft,
    clearNodeOutputById,
    convertNodeToLoopById,
    duplicateNodeById,
    enableHandlesForAllInputs,
    patchNodePropertiesById,
    patchNodeById: updateNodeById,
    patchSelectedNodeProperties,
    removeNodeById,
    renameSchemaFieldIdByNodeId,
    setNodeLabelById,
    setNodePropertiesById,
    setNodeTypeById,
    setSelectedEdgeLabel,
    setSelectedNodeLabel,
    setSelectedNodeType,
    showNodeEditorHelp,
    validateNodeById,
  }
}
