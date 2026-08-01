import { GraphSchema, PropertySpec } from '@/lib/graph/schema'
import { validateSchema } from '@/features/schema/validation'
import { LS_KEYS, UI_COPY } from '@/lib/config'
import { getLocalStorage, lsSetJsonCoalesced } from '@/lib/persistence'
import { layoutModeRequires2d, readLayoutMode2d } from '@/lib/graph/layoutMode'
import type { GraphState } from '@/hooks/store/types'
import type { GraphData, JSONValue } from '@/lib/graph/types'
import type { StoreApi } from 'zustand';
import { buildActive2dZoomViewKey } from '@/lib/canvas/active-2d-zoom-view-key'
import { normalizeCanvas3dMode, resolveCanvas3dMode } from '@/lib/canvas/canvas3dMode'
import { coerceCanvas2dRendererForSchema } from '@/lib/canvas/renderModeConstraints'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { canonicalizeSchemaForPersistence, stringifyCanonicalSchema } from '@/features/schema/schemaCanonical'

type SetGraph = StoreApi<GraphState>['setState']
type GetGraph = StoreApi<GraphState>['getState']

type ValidationRule = {
  required?: string[];
  types?: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>;
  patterns?: Record<string, string>;
  ranges?: Record<string, { min?: number; max?: number }>;
  uniqueness?: string[];
  severity?: 'error' | 'warn';
}

type EndpointMatrix = NonNullable<GraphSchema['endpointMatrix']>
type EndpointSpec = EndpointMatrix[string]

const SCHEMA_LS_PERSIST_DELAY_MS = 180
let lastSchemaStorageSignature = ''

const getSchemaStorageSignature = (schema: GraphSchema | null): string => {
  if (!schema) return 'null'
  try {
    return hashStringToHex(stringifyCanonicalSchema(schema))
  } catch {
    return ''
  }
}

export function writeSchemaToStorage(storage: Storage | null, schema: GraphSchema | null): void {
  if (!storage) return
  try {
    if (!schema) {
      lastSchemaStorageSignature = 'null'
      storage.removeItem(LS_KEYS.graphSchema)
      return
    }
    const canonical = canonicalizeSchemaForPersistence(schema)
    const signature = getSchemaStorageSignature(schema)
    if (signature && signature === lastSchemaStorageSignature) return
    lastSchemaStorageSignature = signature
    lsSetJsonCoalesced(LS_KEYS.graphSchema, canonical, { delayMs: SCHEMA_LS_PERSIST_DELAY_MS })
  } catch {
    void 0
  }
}

export function readSchemaFromStorage(storage: Storage | null): GraphSchema | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(LS_KEYS.graphSchema)
    if (!raw) return null
    lastSchemaStorageSignature = hashStringToHex(raw)
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const validated = validateSchema(parsed as Partial<GraphSchema>)
    const normalizeHex = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '')
    const labelStyles = validated.labelStyles || null
    if (!labelStyles) return validated
    const color = normalizeHex((labelStyles as { color?: unknown }).color)
    const halo = (labelStyles as { halo?: unknown }).halo
    const haloColor =
      halo && typeof halo === 'object' && !Array.isArray(halo) ? normalizeHex((halo as { color?: unknown }).color) : ''
    const shouldStripColor = color === '#111111' || color === '#111'
    const shouldStripHaloColor = haloColor === '#ffffff' || haloColor === '#fff'
    if (!shouldStripColor && !shouldStripHaloColor) return validated
    const nextLabelStyles: Record<string, unknown> = { ...(labelStyles as Record<string, unknown>) }
    if (shouldStripColor) delete nextLabelStyles.color
    if (shouldStripHaloColor) {
      const nextHalo: Record<string, unknown> =
        halo && typeof halo === 'object' && !Array.isArray(halo) ? { ...(halo as Record<string, unknown>) } : {}
      delete nextHalo.color
      nextLabelStyles.halo = nextHalo
    }
    return { ...validated, labelStyles: nextLabelStyles as GraphSchema['labelStyles'] }
  } catch {
    return null
  }
}

export const createSchemaSlice = (set: SetGraph, get: GetGraph) => {
  const setSchemaState = (schema: GraphSchema, opts?: { schemaBySemanticMode?: GraphState['schemaBySemanticMode'] | null }) => {
    const next = { ...schema }
    const prevState = get()

    const prevZoomKey = buildActive2dZoomViewKey({
      canvasRenderMode: prevState.canvasRenderMode,
      canvas2dRenderer: prevState.canvas2dRenderer,
      schema: prevState.schema,
      graphData: (prevState.graphData as unknown as GraphData | null),
      documentSemanticMode: prevState.documentSemanticMode,
      frontmatterModeEnabled: prevState.frontmatterModeEnabled,
      documentStructureBaselineLock: prevState.documentStructureBaselineLock,
      renderMediaAsNodes: prevState.renderMediaAsNodes,
      mediaPanelDensity: prevState.mediaPanelDensity,
      collapsedGroupIds: prevState.collapsedGroupIds,
    })
    const nextZoomKey = buildActive2dZoomViewKey({
      canvasRenderMode: prevState.canvasRenderMode,
      canvas2dRenderer: prevState.canvas2dRenderer,
      schema: next,
      graphData: (prevState.graphData as unknown as GraphData | null),
      documentSemanticMode: prevState.documentSemanticMode,
      frontmatterModeEnabled: prevState.frontmatterModeEnabled,
      documentStructureBaselineLock: prevState.documentStructureBaselineLock,
      renderMediaAsNodes: prevState.renderMediaAsNodes,
      mediaPanelDensity: prevState.mediaPanelDensity,
      collapsedGroupIds: prevState.collapsedGroupIds,
    })
    const prevZoom = prevZoomKey ? prevState.zoomStateByKey?.[prevZoomKey] ?? null : null
    const nextZoomExists = nextZoomKey ? Boolean(prevState.zoomStateByKey?.[nextZoomKey]) : false
    const zoomStateByKey =
      prevZoom && nextZoomKey && !nextZoomExists
        ? { ...(prevState.zoomStateByKey || {}), [nextZoomKey]: prevZoom }
        : prevState.zoomStateByKey
    const prevMode = readLayoutMode2d(prevState.schema)
    const nextMode = readLayoutMode2d(next)
    const prevRequires2d = layoutModeRequires2d(prevMode)
    const nextRequires2d = layoutModeRequires2d(nextMode)
    const canvasRenderMode = prevState.canvasRenderMode
    const lastFree = prevState.canvasRenderModeLastFree
    const isAuto = prevState.canvasRenderModeIsAuto

    const nextCanvas3dMode = resolveCanvas3dMode({
      requested: normalizeCanvas3dMode(prevState.canvas3dMode),
      canvas2dRenderer: prevState.canvas2dRenderer,
      documentSemanticMode: prevState.documentSemanticMode,
      frontmatterModeEnabled: prevState.frontmatterModeEnabled === true,
      multiDimTableModeEnabled: prevState.multiDimTableModeEnabled === true,
      schema: next,
    })

    if (nextRequires2d) {
      if (canvasRenderMode === '3d') {
        set({ canvasRenderMode: '2d', canvasRenderModeLastFree: '3d', canvasRenderModeIsAuto: true })
      }
    } else if (prevRequires2d && !nextRequires2d) {
      if (isAuto && lastFree === '3d') {
        set({ canvasRenderMode: '3d', canvasRenderModeIsAuto: false })
      } else if (isAuto) {
        set({ canvasRenderModeIsAuto: false })
      }
    }
    const documentSemanticMode = (prevState.documentSemanticMode || 'document') as GraphState['documentSemanticMode']
    const prevByMode = prevState.schemaBySemanticMode
    const nextByMode = opts?.schemaBySemanticMode
      ? opts.schemaBySemanticMode
      : {
          document: (prevByMode && prevByMode.document) ? prevByMode.document : next,
          keyword: (prevByMode && prevByMode.keyword) ? prevByMode.keyword : next,
          [documentSemanticMode]: next,
        }
    set({ schema: next, schemaBySemanticMode: nextByMode, zoomStateByKey, canvas3dMode: nextCanvas3dMode })
    if (documentSemanticMode === 'document') writeSchemaToStorage(getLocalStorage(), next)

    const stateAfterSchemaSet = get()
    const nextRenderer = coerceCanvas2dRendererForSchema({
      requested: stateAfterSchemaSet.canvas2dRenderer,
      canvas3dMode: stateAfterSchemaSet.canvas3dMode,
      schema: next,
    })
    if (nextRenderer !== stateAfterSchemaSet.canvas2dRenderer) {
      const setCanvas2dRenderer = stateAfterSchemaSet.setCanvas2dRenderer
      if (typeof setCanvas2dRenderer === 'function') setCanvas2dRenderer(nextRenderer)
    }
  }

  return {
  schemaImportLabel: null,
  schemaOpOk: null,
  schemaOpMsg: '',
  schemaLintCount: null,
  schemaLintExamplePath: null,
  schemaLintExamplePaths: null,
  schemaLastExportHash: null,
  setSchemaLintSummary: (count: number, examplePath: string | null, examplePaths?: string[] | null) => {
    set({ schemaLintCount: count, schemaLintExamplePath: examplePath, schemaLintExamplePaths: examplePaths || null })
  },
  setSchemaLintActivePath: (examplePath: string | null) => {
    const next = typeof examplePath === 'string' ? examplePath.trim() : ''
    set({ schemaLintExamplePath: next ? next : null })
  },
  clearSchemaLintSummary: () => {
    set({ schemaLintCount: null, schemaLintExamplePath: null, schemaLintExamplePaths: null })
  },
  setSchemaLastExportSnapshot: (schema: GraphSchema | null) => {
    if (!schema) {
      set({ schemaLastExportHash: null })
      return
    }
    try {
      const json = stringifyCanonicalSchema(schema)
      let hash = 0
      for (let i = 0; i < json.length; i += 1) {
        const chr = json.charCodeAt(i)
        hash = (hash << 5) - hash + chr
        hash |= 0
      }
      set({ schemaLastExportHash: String(hash) })
    } catch {
      set({ schemaLastExportHash: null })
    }
  },
  setSchemaImportLabel: (label: string | null) => {
    const next = typeof label === 'string' && label.trim() ? label.trim() : null
    set({ schemaImportLabel: next })
  },
  setSchemaOpStatus: (ok: boolean | null, msg: string) => {
    const cleanedMsg = typeof msg === 'string' ? msg.trim() : ''
    set({ schemaOpOk: ok, schemaOpMsg: cleanedMsg })
  },
  setSchema: (schema: GraphSchema) => setSchemaState(validateSchema(schema)),

  updateNodeStyle: (type: string, style: Partial<{ color: string }>) => {
    const { schema } = get();
    const next = { ...schema, nodeStyles: { ...schema.nodeStyles, [type]: { ...schema.nodeStyles[type], ...style } } };
    setSchemaState(next);
  },
  updateEdgeStyle: (label: string, style: Partial<GraphSchema['edgeStyles'][string]>) => {
    const { schema } = get();
    const next = { ...schema, edgeStyles: { ...schema.edgeStyles, [label]: { ...schema.edgeStyles[label], ...style } } };
    setSchemaState(next);
  },
  setBehavior: (b: Partial<GraphSchema['behavior']>) => {
    const { schema } = get();
    const next = { ...schema, behavior: { ...schema.behavior, ...b } };
    const prevByMode = get().schemaBySemanticMode
    const nextByMode = prevByMode
      ? {
          document: { ...(prevByMode.document || next), behavior: { ...((prevByMode.document || next).behavior || {}), ...b } },
          keyword: { ...(prevByMode.keyword || next), behavior: { ...((prevByMode.keyword || next).behavior || {}), ...b } },
        }
      : null
    setSchemaState(next, nextByMode ? { schemaBySemanticMode: nextByMode as any } : undefined);
  },
  updateNodeSize: (type: string, size: Partial<{ radius: number }>) => {
    const { schema } = get();
    const next = { ...schema, nodeSizes: { ...(schema.nodeSizes || {}), [type]: { ...(schema.nodeSizes?.[type] || {}), ...size } } };
    setSchemaState(next);
  },
  updateNodeStroke: (type: string, stroke: Partial<{ color: string; width: number }>) => {
    const { schema } = get();
    const next = { ...schema, nodeStroke: { ...(schema.nodeStroke || {}), [type]: { ...(schema.nodeStroke?.[type] || {}), ...stroke } } };
    setSchemaState(next);
  },
  setLabelStyles: (styles: Partial<{ fontSize: number; color: string }>) => {
    const { schema } = get();
    const next = { ...schema, labelStyles: { ...(schema.labelStyles || {}), ...styles } } as GraphSchema;
    setSchemaState(next);
  },
  setLabelOffset: (off: Partial<{ dx: number; dy: number }>) => {
    const { schema } = get();
    const cur = schema.labelStyles?.offset || {};
    const next = { ...schema, labelStyles: { ...(schema.labelStyles || {}), offset: { ...cur, ...off } } } as GraphSchema;
    setSchemaState(next);
  },
  setLinkDistanceByLabel: (label: string, dist: number) => {
    const { schema } = get();
    const f = schema.layout?.forces || {};
    const next: GraphSchema = { ...schema, layout: { ...(schema.layout || {}), forces: { ...f, linkDistanceByLabel: { ...(f.linkDistanceByLabel || {}), [label]: Math.max(1, Math.floor(dist)) } } } };
    setSchemaState(next);
  },
  setCharge: (val: number) => {
    const { schema } = get();
    const f = schema.layout?.forces || {};
    const next: GraphSchema = { ...schema, layout: { ...(schema.layout || {}), forces: { ...f, charge: val } } };
    setSchemaState(next);
  },
  setCollisionByType: (type: string, radius: number) => {
    const { schema } = get();
    const f = schema.layout?.forces || {};
    const next: GraphSchema = { ...schema, layout: { ...(schema.layout || {}), forces: { ...f, collisionByType: { ...(f.collisionByType || {}), [type]: Math.max(0, Math.floor(radius)) } } } };
    setSchemaState(next);
  },
  setAlphaDecay: (val: number) => {
    const { schema } = get();
    const f = schema.layout?.forces || {};
    const next: GraphSchema = { ...schema, layout: { ...(schema.layout || {}), forces: { ...f, alphaDecay: Math.max(0, Math.min(1, val)) } } };
    setSchemaState(next);
  },
  upsertNodeValidation: (type: string, v: Partial<ValidationRule>) => {
    const { schema } = get();
    const next: GraphSchema = { ...schema, validation: { ...(schema.validation || {}), node: { ...(schema.validation?.node || {}), [type]: { ...(schema.validation?.node?.[type] || {}), ...v } } } };
    setSchemaState(next);
  },
  upsertEdgeValidation: (label: string, v: Partial<ValidationRule>) => {
    const { schema } = get();
    const next: GraphSchema = { ...schema, validation: { ...(schema.validation || {}), edge: { ...(schema.validation?.edge || {}), [label]: { ...(schema.validation?.edge?.[label] || {}), ...v } } } };
    setSchemaState(next);
  },
  setEndpointMatrix: (label: string, sources: string[], targets: string[]) => {
    const { schema } = get();
    const next: GraphSchema = { ...schema, endpointMatrix: { ...(schema.endpointMatrix || {}), [label]: { sources: sources || [], targets: targets || [] } } };
    setSchemaState(next);
  },
  setCardinalityNodeType: (type: string, minEdges?: number, maxEdges?: number) => {
    const { schema } = get();
    const cur = schema.cardinality || { nodeType: {}, edgeLabel: {} };
    const next: GraphSchema = { ...schema, cardinality: { ...cur, nodeType: { ...(cur.nodeType || {}), [type]: { minEdges, maxEdges } } } };
    setSchemaState(next);
  },
  setCardinalityEdgeLabel: (label: string, maxPerNode?: number) => {
    const { schema } = get();
    const cur = schema.cardinality || { nodeType: {}, edgeLabel: {} };
    const next: GraphSchema = { ...schema, cardinality: { ...cur, edgeLabel: { ...(cur.edgeLabel || {}), [label]: { maxPerNode } } } };
    setSchemaState(next);
  },
  setNodeTemplate: (type: string, tpl: Record<string, import('@/lib/graph/types').JSONValue>) => {
    const { schema } = get();
    const cur = schema.templates || { node: {}, edge: {} };
    const next: GraphSchema = { ...schema, templates: { ...cur, node: { ...(cur.node || {}), [type]: tpl || {} } } };
    setSchemaState(next);
  },
  setEdgeTemplate: (label: string, tpl: Record<string, import('@/lib/graph/types').JSONValue>) => {
    const { schema } = get();
    const cur = schema.templates || { node: {}, edge: {} };
    const next: GraphSchema = { ...schema, templates: { ...cur, edge: { ...(cur.edge || {}), [label]: tpl || {} } } };
    setSchemaState(next);
  },
  setLodHideLabelsBelow: (scale: number) => {
    const { schema } = get();
    const cur = schema.performance || { lod: { hideLabelsBelowScale: 0 }, caps: { maxNodes: 0, maxEdges: 0 } };
    const next: GraphSchema = { ...schema, performance: { ...cur, lod: { ...(cur.lod || {}), hideLabelsBelowScale: Math.max(0, scale) } } };
    setSchemaState(next);
  },
  setHighContrast: (v: boolean) => {
    const { schema } = get();
    const next: GraphSchema = { ...schema, accessibility: { ...(schema.accessibility || {}), highContrast: !!v } };
    setSchemaState(next);
  },
  setThreeConfig: (cfg: Partial<GraphSchema['three']>) => {
    const { schema } = get();
    const prevThree = schema.three || {};
    const nextThree: GraphSchema['three'] = { ...prevThree, ...(cfg || {}) };
    if (cfg && cfg.selection) {
      const prevSel = prevThree.selection || {};
      nextThree.selection = { ...prevSel, ...cfg.selection };
    }
    const next: GraphSchema = { ...schema, three: nextThree };
    setSchemaState(next);
  },
  setNodeShape: (type: string, shape: 'circle' | 'rect' | 'diamond' | 'hex' | 'image') => {
    const { schema } = get();
    const next: GraphSchema = { ...schema, nodeShapes: { ...(schema.nodeShapes || {}), [type]: shape } };
    setSchemaState(next);
  },
  setEdgeArrow: (label: string, arrow: boolean) => {
    const { schema } = get();
    const cur = schema.edgeStyles[label] || {};
    const next: GraphSchema = {
      ...schema,
      edgeStyles: {
        ...schema.edgeStyles,
        [label]: { ...cur, arrow: !!arrow, markerEnd: arrow ? 'arrow' : 'none' },
      },
    };
    setSchemaState(next);
  },
  setSelectMode: (mode: 'single' | 'multi' | 'lasso') => {
    if (get().documentStructureBaselineLock === true) {
      get().upsertUiToast({
        id: 'baseline-locked',
        kind: 'warning',
        message: UI_COPY.baselineLockedToast,
        ttlMs: 6000,
      })
      return
    }
    const { schema } = get();
    const next: GraphSchema = { ...schema, behavior: { ...schema.behavior, selectMode: mode } };
    setSchemaState(next);
  },
  setCreateMode: (mode: 'shift-drag' | 'click-source-target' | 'panel-only') => {
    if (get().documentStructureBaselineLock === true) {
      get().upsertUiToast({
        id: 'baseline-locked',
        kind: 'warning',
        message: UI_COPY.baselineLockedToast,
        ttlMs: 6000,
      })
      return
    }
    const { schema } = get();
    const next: GraphSchema = { ...schema, behavior: { ...schema.behavior, createMode: mode } };
    setSchemaState(next);
  },
  setHover: (v: Partial<{ intensity: number; debounceMs: number }>) => {
    const { schema } = get();
    const curHover: { intensity?: number; debounceMs?: number } = schema.behavior?.hover || {};
    const next: GraphSchema = { ...schema, behavior: { ...schema.behavior, hover: { ...curHover, ...v } } };
    setSchemaState(next);
  },
  setSerialization: (v: Partial<GraphSchema['serialization']>) => {
    const { schema } = get();
    const next: GraphSchema = { ...schema, serialization: { ...(schema.serialization || {}), ...v } };
    setSchemaState(next);
  },

  addNodeType: (type: string) => {
    const { schema } = get();
    const t = String(type || '').trim();
    if (!t) return;
    const catalog = schema.catalog || { nodeTypes: [], edgeLabels: [] };
    if (catalog.nodeTypes.includes(t)) return;
    const next: GraphSchema = {
      ...schema,
      catalog: { ...catalog, nodeTypes: [...catalog.nodeTypes, t] },
      propertySchemas: { ...(schema.propertySchemas || {}), node: { ...(schema.propertySchemas?.node || {}), [t]: { ...(schema.propertySchemas?.node?.[t] || {}) } } },
    };
    setSchemaState(next);
  },
  renameNodeType: (oldType: string, newType: string) => {
    const { schema } = get();
    const a = String(oldType || '').trim();
    const b = String(newType || '').trim();
    if (!a || !b || a === b) return;
    const catalog = schema.catalog || { nodeTypes: [], edgeLabels: [] };
    const nextNodeTypes = catalog.nodeTypes.map(x => (x === a ? b : x));
    const ns = schema.nodeStyles || {};
    const nsizes = schema.nodeSizes || {};
    const nstroke = schema.nodeStroke || {};
    const nshapes = schema.nodeShapes || {};
    const coll = schema.layout?.forces?.collisionByType || {};
    const card = schema.cardinality?.nodeType || {};
    const vNode = schema.validation?.node || {};
    const tNode = schema.templates?.node || {};
    const pNode = schema.propertySchemas?.node || {};
    const endpoint: EndpointMatrix = schema.endpointMatrix ?? {};
    const renameKey = <V>(obj: Record<string, V>, from: string, to: string): Record<string, V> => {
      const out: Record<string, V> = {};
      Object.entries(obj || {}).forEach(([k, v]) => { out[k === from ? to : k] = v; });
      return out;
    };
    const renameInArrayVals = (arr: string[]) => arr.map(x => (x === a ? b : x));
    const endpointRenamed: EndpointMatrix = {};
    Object.entries(endpoint).forEach(([label, val]) => {
      const v: EndpointSpec = val
      endpointRenamed[label] = { sources: renameInArrayVals(v.sources), targets: renameInArrayVals(v.targets) };
    });
    const next: GraphSchema = {
      ...schema,
      catalog: { ...catalog, nodeTypes: nextNodeTypes },
      nodeStyles: renameKey(ns, a, b),
      nodeSizes: renameKey(nsizes, a, b),
      nodeStroke: renameKey(nstroke, a, b),
      nodeShapes: renameKey(nshapes, a, b),
      layout: { ...(schema.layout || {}), forces: { ...(schema.layout?.forces || {}), collisionByType: renameKey(coll, a, b) } },
      cardinality: { ...(schema.cardinality || {}), nodeType: renameKey(card, a, b) },
      validation: { ...(schema.validation || {}), node: renameKey(vNode, a, b) },
      templates: { ...(schema.templates || {}), node: renameKey(tNode, a, b) },
      propertySchemas: { ...(schema.propertySchemas || {}), node: renameKey(pNode, a, b) },
      endpointMatrix: endpointRenamed,
    };
    setSchemaState(next);
  },
  removeNodeType: (type: string) => {
    const { schema } = get();
    const t = String(type || '').trim();
    if (!t) return;
    const catalog = schema.catalog || { nodeTypes: [], edgeLabels: [] };
    const nextNodeTypes = catalog.nodeTypes.filter(x => x !== t);
    const omitKey = <V>(obj: Record<string, V>, key: string): Record<string, V> => {
      const out: Record<string, V> = {};
      Object.entries(obj || {}).forEach(([k, v]) => { if (k !== key) out[k] = v; });
      return out;
    };
    const endpoint: EndpointMatrix = schema.endpointMatrix ?? {};
    const endpointCleaned: EndpointMatrix = {};
    Object.entries(endpoint).forEach(([label, val]) => {
      const v: EndpointSpec = val
      endpointCleaned[label] = {
        sources: v.sources.filter(x => x !== t),
        targets: v.targets.filter(x => x !== t),
      };
    });
    const next: GraphSchema = {
      ...schema,
      catalog: { ...catalog, nodeTypes: nextNodeTypes },
      nodeStyles: omitKey(schema.nodeStyles || {}, t),
      nodeSizes: omitKey(schema.nodeSizes || {}, t),
      nodeStroke: omitKey(schema.nodeStroke || {}, t),
      nodeShapes: omitKey(schema.nodeShapes || {}, t),
      layout: { ...(schema.layout || {}), forces: { ...(schema.layout?.forces || {}), collisionByType: omitKey(schema.layout?.forces?.collisionByType || {}, t) } },
      cardinality: { ...(schema.cardinality || {}), nodeType: omitKey(schema.cardinality?.nodeType || {}, t) },
      validation: { ...(schema.validation || {}), node: omitKey(schema.validation?.node || {}, t) },
      templates: { ...(schema.templates || {}), node: omitKey(schema.templates?.node || {}, t) },
      propertySchemas: { ...(schema.propertySchemas || {}), node: omitKey(schema.propertySchemas?.node || {}, t) },
      endpointMatrix: endpointCleaned,
    };
    setSchemaState(next);
  },

  addEdgeLabel: (label: string) => {
    const { schema } = get();
    const l = String(label || '').trim();
    if (!l) return;
    const catalog = schema.catalog || { nodeTypes: [], edgeLabels: [] };
    if (catalog.edgeLabels.includes(l)) return;
    const next: GraphSchema = {
      ...schema,
      catalog: { ...catalog, edgeLabels: [...catalog.edgeLabels, l] },
      endpointMatrix: { ...(schema.endpointMatrix || {}), [l]: { sources: [], targets: [] } },
      propertySchemas: { ...(schema.propertySchemas || {}), edge: { ...(schema.propertySchemas?.edge || {}), [l]: { ...(schema.propertySchemas?.edge?.[l] || {}) } } },
    };
    setSchemaState(next);
  },
  renameEdgeLabel: (oldLabel: string, newLabel: string) => {
    const { schema } = get();
    const a = String(oldLabel || '').trim();
    const b = String(newLabel || '').trim();
    if (!a || !b || a === b) return;
    const catalog = schema.catalog || { nodeTypes: [], edgeLabels: [] };
    const nextEdgeLabels = catalog.edgeLabels.map(x => (x === a ? b : x));
    const es = schema.edgeStyles || {};
    const ld = schema.layout?.forces?.linkDistanceByLabel || {};
    const card = schema.cardinality?.edgeLabel || {};
    const vEdge = schema.validation?.edge || {};
    const tEdge = schema.templates?.edge || {};
    const pEdge = schema.propertySchemas?.edge || {};
    const endpoint = schema.endpointMatrix || {};
    const renameKey = <V>(obj: Record<string, V>, from: string, to: string): Record<string, V> => {
      const out: Record<string, V> = {};
      Object.entries(obj || {}).forEach(([k, v]) => { out[k === from ? to : k] = v; });
      return out;
    };
    const next: GraphSchema = {
      ...schema,
      catalog: { ...catalog, edgeLabels: nextEdgeLabels },
      edgeStyles: renameKey(es, a, b),
      layout: { ...(schema.layout || {}), forces: { ...(schema.layout?.forces || {}), linkDistanceByLabel: renameKey(ld, a, b) } },
      cardinality: { ...(schema.cardinality || {}), edgeLabel: renameKey(card, a, b) },
      validation: { ...(schema.validation || {}), edge: renameKey(vEdge, a, b) },
      templates: { ...(schema.templates || {}), edge: renameKey(tEdge, a, b) },
      propertySchemas: { ...(schema.propertySchemas || {}), edge: renameKey(pEdge, a, b) },
      endpointMatrix: renameKey(endpoint, a, b),
    };
    setSchemaState(next);
  },
  removeEdgeLabel: (label: string) => {
    const { schema } = get();
    const l = String(label || '').trim();
    if (!l) return;
    const catalog = schema.catalog || { nodeTypes: [], edgeLabels: [] };
    const nextEdgeLabels = catalog.edgeLabels.filter(x => x !== l);
    const omitKey = <V>(obj: Record<string, V>, key: string): Record<string, V> => {
      const out: Record<string, V> = {};
      Object.entries(obj || {}).forEach(([k, v]) => { if (k !== key) out[k] = v; });
      return out;
    };
    const next: GraphSchema = {
      ...schema,
      catalog: { ...catalog, edgeLabels: nextEdgeLabels },
      edgeStyles: omitKey(schema.edgeStyles || {}, l),
      layout: { ...(schema.layout || {}), forces: { ...(schema.layout?.forces || {}), linkDistanceByLabel: omitKey(schema.layout?.forces?.linkDistanceByLabel || {}, l) } },
      cardinality: { ...(schema.cardinality || {}), edgeLabel: omitKey(schema.cardinality?.edgeLabel || {}, l) },
      validation: { ...(schema.validation || {}), edge: omitKey(schema.validation?.edge || {}, l) },
      templates: { ...(schema.templates || {}), edge: omitKey(schema.templates?.edge || {}, l) },
      propertySchemas: { ...(schema.propertySchemas || {}), edge: omitKey(schema.propertySchemas?.edge || {}, l) },
      endpointMatrix: omitKey(schema.endpointMatrix || {}, l),
    };
    setSchemaState(next);
  },

  upsertNodeProperty: (type: string, key: string, spec: PropertySpec) => {
    const { schema } = get();
    const t = String(type || '').trim();
    const k = String(key || '').trim();
    if (!t || !k) return;
    const ps = schema.propertySchemas || { node: {}, edge: {} };
    const nodeProps = ps.node || {};
    const nextNodeProps = { ...nodeProps, [t]: { ...(nodeProps[t] || {}), [k]: { ...(nodeProps[t]?.[k] || {}), ...spec } } };
    const v = schema.validation || {};
    const vNode = v.node || {};
    const typesMap: Record<string, PropertySpec['type']> = { ...(vNode[t]?.types ?? {}) };
    if (spec.type) typesMap[k] = spec.type;
    const required = new Set<string>(vNode[t]?.required || []);
    if (spec.required) required.add(k); else required.delete(k);
    const patterns: Record<string, string> = { ...(vNode[t]?.patterns ?? {}) };
    if (spec.pattern != null) patterns[k] = spec.pattern;
    const ranges: Record<string, { min?: number; max?: number }> = { ...(vNode[t]?.ranges ?? {}) };
    if (spec.range) ranges[k] = { ...ranges[k], ...spec.range };
    const uniqueness = new Set<string>(vNode[t]?.uniqueness || []);
    if (spec.uniqueness) uniqueness.add(k); else uniqueness.delete(k);
    const tplNode = schema.templates?.node || {};
    const tplForType: Record<string, JSONValue> = { ...(tplNode[t] ?? {}) };
    if (spec.default !== undefined) tplForType[k] = spec.default;
    const next: GraphSchema = {
      ...schema,
      propertySchemas: { ...ps, node: nextNodeProps },
      validation: { ...v, node: { ...vNode, [t]: { ...(vNode[t] || {}), types: typesMap, required: Array.from(required), patterns, ranges, uniqueness: Array.from(uniqueness) } } },
      templates: { ...(schema.templates || {}), node: { ...tplNode, [t]: tplForType } },
    };
    setSchemaState(next);
  },
  removeNodeProperty: (type: string, key: string) => {
    const { schema } = get();
    const t = String(type || '').trim();
    const k = String(key || '').trim();
    if (!t || !k) return;
    const ps = schema.propertySchemas || { node: {}, edge: {} };
    const nodeProps = ps.node || {};
    const propsForType = { ...(nodeProps[t] || {}) };
    delete propsForType[k];
    const nextNodeProps = { ...nodeProps, [t]: propsForType };
    const v = schema.validation || {};
    const vNode = v.node || {};
    const typesMap: Record<string, PropertySpec['type']> = { ...(vNode[t]?.types ?? {}) };
    delete typesMap[k];
    const required = new Set<string>(vNode[t]?.required || []);
    required.delete(k);
    const patterns: Record<string, string> = { ...(vNode[t]?.patterns ?? {}) };
    delete patterns[k];
    const ranges: Record<string, { min?: number; max?: number }> = { ...(vNode[t]?.ranges ?? {}) };
    delete ranges[k];
    const uniqueness = new Set<string>(vNode[t]?.uniqueness || []);
    uniqueness.delete(k);
    const tplNode = schema.templates?.node || {};
    const tplForType: Record<string, JSONValue> = { ...(tplNode[t] ?? {}) };
    delete tplForType[k];
    const next: GraphSchema = {
      ...schema,
      propertySchemas: { ...ps, node: nextNodeProps },
      validation: { ...v, node: { ...vNode, [t]: { ...(vNode[t] || {}), types: typesMap, required: Array.from(required), patterns, ranges, uniqueness: Array.from(uniqueness) } } },
      templates: { ...(schema.templates || {}), node: { ...tplNode, [t]: tplForType } },
    };
    setSchemaState(next);
  },
  upsertEdgeProperty: (label: string, key: string, spec: PropertySpec) => {
    const { schema } = get();
    const l = String(label || '').trim();
    const k = String(key || '').trim();
    if (!l || !k) return;
    const ps = schema.propertySchemas || { node: {}, edge: {} };
    const edgeProps = ps.edge || {};
    const nextEdgeProps = { ...edgeProps, [l]: { ...(edgeProps[l] || {}), [k]: { ...(edgeProps[l]?.[k] || {}), ...spec } } };
    const v = schema.validation || {};
    const vEdge = v.edge || {};
    const typesMap: Record<string, PropertySpec['type']> = { ...(vEdge[l]?.types ?? {}) };
    if (spec.type) typesMap[k] = spec.type;
    const required = new Set<string>(vEdge[l]?.required || []);
    if (spec.required) required.add(k); else required.delete(k);
    const patterns: Record<string, string> = { ...(vEdge[l]?.patterns ?? {}) };
    if (spec.pattern != null) patterns[k] = spec.pattern;
    const ranges: Record<string, { min?: number; max?: number }> = { ...(vEdge[l]?.ranges ?? {}) };
    if (spec.range) ranges[k] = { ...ranges[k], ...spec.range };
    const uniqueness = new Set<string>(vEdge[l]?.uniqueness || []);
    if (spec.uniqueness) uniqueness.add(k); else uniqueness.delete(k);
    const tplEdge = schema.templates?.edge || {};
    const tplForLabel: Record<string, JSONValue> = { ...(tplEdge[l] ?? {}) };
    if (spec.default !== undefined) tplForLabel[k] = spec.default;
    const next: GraphSchema = {
      ...schema,
      propertySchemas: { ...ps, edge: nextEdgeProps },
      validation: { ...v, edge: { ...vEdge, [l]: { ...(vEdge[l] || {}), types: typesMap, required: Array.from(required), patterns, ranges, uniqueness: Array.from(uniqueness) } } },
      templates: { ...(schema.templates || {}), edge: { ...tplEdge, [l]: tplForLabel } },
    };
    setSchemaState(next);
  },
  removeEdgeProperty: (label: string, key: string) => {
    const { schema } = get();
    const l = String(label || '').trim();
    const k = String(key || '').trim();
    if (!l || !k) return;
    const ps = schema.propertySchemas || { node: {}, edge: {} };
    const edgeProps = ps.edge || {};
    const propsForLabel = { ...(edgeProps[l] || {}) };
    delete propsForLabel[k];
    const nextEdgeProps = { ...edgeProps, [l]: propsForLabel };
    const v = schema.validation || {};
    const vEdge = v.edge || {};
    const typesMap: Record<string, PropertySpec['type']> = { ...(vEdge[l]?.types ?? {}) };
    delete typesMap[k];
    const required = new Set<string>(vEdge[l]?.required || []);
    required.delete(k);
    const patterns: Record<string, string> = { ...(vEdge[l]?.patterns ?? {}) };
    delete patterns[k];
    const ranges: Record<string, { min?: number; max?: number }> = { ...(vEdge[l]?.ranges ?? {}) };
    delete ranges[k];
    const uniqueness = new Set<string>(vEdge[l]?.uniqueness || []);
    uniqueness.delete(k);
    const tplEdge = schema.templates?.edge || {};
    const tplForLabel: Record<string, JSONValue> = { ...(tplEdge[l] ?? {}) };
    delete tplForLabel[k];
    const next: GraphSchema = {
      ...schema,
      propertySchemas: { ...ps, edge: nextEdgeProps },
      validation: { ...v, edge: { ...vEdge, [l]: { ...(vEdge[l] || {}), types: typesMap, required: Array.from(required), patterns, ranges, uniqueness: Array.from(uniqueness) } } },
      templates: { ...(schema.templates || {}), edge: { ...tplEdge, [l]: tplForLabel } },
    };
    setSchemaState(next);
  },
  }
};
