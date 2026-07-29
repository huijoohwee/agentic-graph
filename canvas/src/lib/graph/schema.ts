import type { GraphNode } from './types';
import type { GraphSchema, ThreeConfig, ThreeSelectionConfig, RendererPalette } from './schemaTypes';
import { toMetadataRecord } from '@/lib/graph/documentMetadata'
import { isPlainObject } from '@/lib/graph/value'
import {
  DEFAULT_ALPHA_DECAY,
  DEFAULT_BBOX_COLLIDE_ITERATIONS,
  DEFAULT_BBOX_COLLIDE_PADDING,
  DEFAULT_BBOX_COLLIDE_STRENGTH,
  DEFAULT_CENTER_STRENGTH,
  DEFAULT_CHARGE,
  DEFAULT_FIT_PADDING,
  DEFAULT_GROUP_BBOX_COLLIDE_ITERATIONS,
  DEFAULT_GROUP_BBOX_COLLIDE_PADDING,
  DEFAULT_GROUP_BBOX_COLLIDE_STRENGTH,
  DEFAULT_GROUP_CORNER_RADIUS,
  DEFAULT_GROUPS_ENABLED,
  DEFAULT_GROUP_FILL_OPACITY,
  DEFAULT_GROUP_NESTED_PADDING_STEP,
  DEFAULT_GROUP_LABEL_PADDING,
  DEFAULT_GROUP_PADDING,
  DEFAULT_GROUP_SHAPE,
  DEFAULT_GROUP_STROKE_WIDTH,
  DEFAULT_EDGE_OPACITY_2D,
  DEFAULT_EDGE_OPACITY_2D_UNDER_GROUPS,
  DEFAULT_ZOOM_MAX_SCALE,
  DEFAULT_ZOOM_MIN_SCALE,
} from './layoutDefaults';

// Re-export types and property helpers
export * from './schemaTypes';
export * from './schemaProperties';

export function getThreeConfig(schema: GraphSchema | null | undefined): ThreeConfig {
  const three = schema && schema.three;
  if (!three) return {};
  return three as ThreeConfig;
}

export function getThreeSelectionConfig(schema: GraphSchema | null | undefined): ThreeSelectionConfig {
  const threeCfg = getThreeConfig(schema);
  const raw = (threeCfg.selection || {}) as {
    selectedNodeGlowIntensity?: number;
    dimmedNodeOpacity?: number;
    dimmedEdgeOpacity?: number;
    selectedEdgeWidth?: number;
    selectedEdgeColor?: string;
  };
  const selectedNodeGlowIntensity =
    typeof raw.selectedNodeGlowIntensity === 'number' ? raw.selectedNodeGlowIntensity : 0.8;
  const dimmedNodeOpacity = typeof raw.dimmedNodeOpacity === 'number' ? raw.dimmedNodeOpacity : 0.2;
  const dimmedEdgeOpacity = typeof raw.dimmedEdgeOpacity === 'number' ? raw.dimmedEdgeOpacity : 0.2;
  const selectedEdgeWidth = typeof raw.selectedEdgeWidth === 'number' ? raw.selectedEdgeWidth : 3;
  const selectedEdgeColor =
    typeof raw.selectedEdgeColor === 'string' && raw.selectedEdgeColor.trim().length > 0
      ? raw.selectedEdgeColor
      : MVP_COLOR_PALETTE.nodes.idea;
  return {
    selectedNodeGlowIntensity,
    dimmedNodeOpacity,
    dimmedEdgeOpacity,
    selectedEdgeWidth,
    selectedEdgeColor,
  };
}

export const MVP_COLOR_PALETTE = {
  nodes: {
    idea: 'var(--kg-canvas-accent)',
    hypothesis: '#FFC107',
    execution: '#28A745',
    pivot: '#FD7E14',
    alert: '#DC3545',
  },
  edges: {
    critical: '#DC3545',
    neutral: '#9CA3AF',
  },
} as const;

const AGENTIC_RAG_TAG_PRIORITY: readonly string[] = ['idea', 'hypothesis', 'execution', 'pivot', 'alert'];

export function getAgenticRagTagColor(node: GraphNode, schema: GraphSchema): string | null {
  const props = node.properties || {};
  const raw = props.tags;
  if (!Array.isArray(raw)) return null;
  const tags: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const v = raw[i];
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v).trim().toLowerCase();
      if (s) tags.push(s);
    }
  }
  if (!tags.length) return null;
  const palette = getRendererPalette(schema);
  const nodesPalette = palette.nodes || {};
  for (let i = 0; i < AGENTIC_RAG_TAG_PRIORITY.length; i += 1) {
    const key = AGENTIC_RAG_TAG_PRIORITY[i];
    if (!Object.prototype.hasOwnProperty.call(nodesPalette, key)) continue;
    if (!tags.includes(key)) continue;
    const color = nodesPalette[key];
    if (typeof color === 'string' && color.trim()) return color;
  }
  return null;
}

export function getRendererPalette(schema: GraphSchema | null | undefined): RendererPalette {
  const baseNodes = MVP_COLOR_PALETTE.nodes;
  const baseEdges = MVP_COLOR_PALETTE.edges;
  const meta = toMetadataRecord(schema?.metadata)
  const raw = Object.prototype.hasOwnProperty.call(meta, 'renderer:palette')
    ? (meta['renderer:palette'] as unknown)
    : undefined;
  if (isPlainObject(raw)) {
    const obj = raw as { nodes?: Record<string, string>; edges?: Record<string, string> };
    return {
      nodes: { ...baseNodes, ...(obj.nodes || {}) },
      edges: { ...baseEdges, ...(obj.edges || {}) },
    };
  }
  return { nodes: baseNodes, edges: baseEdges };
}

export const defaultSchema: GraphSchema = {
  nodeStyles: {
    Subject: { color: 'var(--kg-canvas-accent)' },
    Object: { color: 'var(--kg-canvas-accent)' },
    Entity: { color: 'var(--kg-canvas-accent)' },
    Chunk: { color: 'var(--kg-canvas-accent)' },
    EmbeddingMeta: { color: 'var(--kg-text-tertiary)' },
  },
  edgeStyles: {
    relatedTo: { color: 'var(--kg-canvas-edge-stroke)', width: 1.5 },
    pointsTo: { color: 'var(--kg-canvas-edge-stroke)', width: 1.5, arrow: true },
  },
  metadata: {
    'renderer:palette': {
      nodes: {
        idea: 'var(--kg-canvas-accent)',
        hypothesis: '#f59e0b',
        execution: '#22c55e',
        pivot: '#f97316',
        alert: '#ef4444',
      },
      edges: {
        critical: '#ef4444',
        neutral: 'var(--kg-canvas-edge-stroke)',
      },
    },
  },
  nodeSizes: {},
  nodeStroke: {},
  labelStyles: { fontSize: 14, offset: { dx: 12, dy: 4 }, halo: { width: 3 } },
  nodeShapes: { Image: 'rect' },
  edgeRouting: { mode: 'straight', curvatureByLabel: {} },
  layout: {
    mode: 'block',
    edges: {
      type: 'bezier',
      color: 'var(--kg-canvas-accent)',
      strokeWidthPx: 1.5,
      animated: true,
      opacity: DEFAULT_EDGE_OPACITY_2D,
      opacityUnderGroups: DEFAULT_EDGE_OPACITY_2D_UNDER_GROUPS,
    },
    flow: {
      engine: 'auto',
      elkLayout: 'elk',
      edges: {
        routing: { enabled: true, mode: 'ortho', obstacleAvoidance: true, marginPx: 10, laneStepPx: 56, maxLanes: 10 },
        underlay: { enabled: true, groupFadeAlpha: 0.65 },
      },
    },
    forces: {
      linkDistanceByLabel: {},
      charge: DEFAULT_CHARGE,
      collisionByType: {},
      centerStrength: DEFAULT_CENTER_STRENGTH,
      alphaDecay: DEFAULT_ALPHA_DECAY,
      bboxCollide: true,
      bboxCollideStrength: DEFAULT_BBOX_COLLIDE_STRENGTH,
      bboxCollidePadding: DEFAULT_BBOX_COLLIDE_PADDING,
      bboxCollideIterations: DEFAULT_BBOX_COLLIDE_ITERATIONS,
      groupBboxCollide: true,
      groupBboxCollideStrength: DEFAULT_GROUP_BBOX_COLLIDE_STRENGTH,
      groupBboxCollidePadding: DEFAULT_GROUP_BBOX_COLLIDE_PADDING,
      groupBboxCollideIterations: DEFAULT_GROUP_BBOX_COLLIDE_ITERATIONS,
      antiLineForce: false,
      antiLineStrength: 0.06,
      antiLineAlphaMin: 0.14,
      antiLineTickInterval: 2,
      postFitForce: false,
      postFitStrength: 0.34,
      postFitAlphaMax: 0.12,
      radialOrbitEnabled: false,
      radialOrbitSpeedDeg: 18,
      radialOrbitSize: 2.95,
      radialOrbitRingGapPx: 58,
      radialOrbitDepthSpeedScale: 0.12,
      radialOrbitMode: 'flat',
    },
    fitPadding: DEFAULT_FIT_PADDING,
    fitDetectClusters: true,
    fitTargetAspectRatio: 1.777,
    fitEnforceAspectRatio: true,
    groups: {
      enabled: DEFAULT_GROUPS_ENABLED,
      shape: DEFAULT_GROUP_SHAPE,
      padding: DEFAULT_GROUP_PADDING,
      nestedPaddingStep: DEFAULT_GROUP_NESTED_PADDING_STEP,
      cornerRadius: DEFAULT_GROUP_CORNER_RADIUS,
      labelPadding: DEFAULT_GROUP_LABEL_PADDING,
      strokeWidth: DEFAULT_GROUP_STROKE_WIDTH,
      fillOpacity: DEFAULT_GROUP_FILL_OPACITY,
      depthStyle: { enabled: true, outerMaxBoostSteps: 3, outerStrokeWidthStepPx: 0.55, outerFillOpacityStep: 0.035 },
    },
  },
  endpointMatrix: {},
  cardinality: { nodeType: {}, edgeLabel: {} },
  templates: { node: {}, edge: {} },
  performance: {
    lod: { hideLabelsBelowScale: 0.0 },
    zoom: { minScale: DEFAULT_ZOOM_MIN_SCALE, maxScale: DEFAULT_ZOOM_MAX_SCALE },
    caps: { maxNodes: 0, maxEdges: 0 },
    labelRelax: { maxNodeLabels: 420, maxNodesForRelax: 3600 },
  },
  accessibility: { highContrast: false },
  legend: { showLegend: false },
  rules: [],
  behavior: {
    allowEdgeCreation: true,
    allowNodeDrag: true,
    nodeShapeMode: 'circle',
    dragConstraint: 'free',
    snapGrid: { enabled: false, size: 10 },
    helperLines: { enabled: true },
    canvasGrid: {
      enabled: false,
      variant: 'lines',
      majorEvery: 5,
      dotRadiusPx: 1.25,
      minorAlpha: 0.16,
      majorAlpha: 0.34,
      minorWidthPx: 1,
      majorWidthPx: 1.25,
    },
    preventDuplicatesGlobal: true,
    preventSelfLoopsGlobal: true,
    portHandles: {
      enabled: false,
      placement: 'cardinal',
      size: 4,
      offset: 2,
      strokeWidth: 1.5,
    },
    hover: {
      enabled: true,
      content: {
        showProps: true,
        showType: true,
        showId: true,
      }
    },
    expansion: {
      enabled: true,
      highlightNeighbors: true,
      zoomOnSelection: true,
      zoomOnDoubleClick: true,
    },
    defaultNodeType: undefined,
  },
  catalog: { nodeTypes: [], edgeLabels: [] },
  propertySchemas: { node: {}, edge: {} },
  three: {
    voxelAnimationEnabled: true,
    linkDirectionalArrowLength: 8,
    linkOpacity: 0.55,
    edgeOpacityByLabel: {},
    linkCurvature: 0.0,
    linkCurveRotation: 0.0,
    linkDirectionalArrowRelPos: 0.85,
    linkDirectionalParticles: 0,
    linkDirectionalParticleSpeed: 0.6,
    sphereRadius: 120,
    seed: 1,
    minSpacing: 32,
    voxelSeedScaleFactor: 1,
    voxelGridScaleFactor: 1,
    voxelLayerSpacing: 84,
    voxelLayerPlatesEnabled: true,
    voxelLayerPlateOpacity: 0.06,
    voxelLayerPlateRiseDurationMs: 900,
    voxelLayerPlateRiseStaggerMs: 160,
    voxelClusterPulseEnabled: true,
    voxelClusterPulseStrength: 0.22,
    voxelEdgeHoverOpacity: 0.65,
    voxelGapRingThreshold: 0.85,
    voxelIntroEnabled: true,
    voxelIntroDelayMs: 320,
    voxelIntroDurationMs: 1100,
    voxelDefaultYawDeg: -36,
    voxelDefaultTiltDeg: 32,
    voxelDefaultDistanceFactor: 2.2,
    voxelDefaultTargetLift: 8,
    voxelGhostOpacity: 0.32,
    voxelTopCapEmissiveIntensity: 0.9,
    voxelHubPulseStrength: 0.07,
    voxelConceptFloatStrength: 1,
    voxelClusterLightIntensity: 0.7,
    voxelIdleAutoRotateDelayMs: 900,
    voxelIdleAutoRotateSpeed: 0.12,
    voxelLabelsEnabled: true,
    voxelLabelOpacity: 0.9,
    voxelLabelFontSizePx: 12,
    voxelLabelMaxChars: 42,
    voxelLabelShowOnHoverOnly: false,
    voxelLabelLift: 4,
    nodeMotionIntensity: 1.0,
    minimapOpacity: 0.7,
    backgroundColor: '',
    fogColor: '',
    fogNear: 180,
    fogFar: 360,
    cameraDampingFactor: 0.08,
    cameraRotateSpeed: 0.6,
    cameraZoomSpeed: 0.8,
    cameraPanSpeed: 0.5,
    cameraAutoRotate: false,
    cameraAutoRotateSpeed: 0.4,
    nodeSizingFormula: 'schema',
    nodeImportanceSources: ['visual:importance'],
    edgeWidthFormula: 'schema',
    globeEffectsEnabled: true,
    globeParticleCount: 720,
    globeParticleSize: 1.35,
    globeParticleWaveSpeed: 0.85,
    globeParticleWaveAmplitude: 0.65,
    globeAtmosphereOpacity: 0.22,
    globeGridDensity: 12,
    globeOrbitRingCount: 4,
    globeToolNodeCount: 24,
    globeArcCount: 12,
    globeArcTravelerCount: 1,
    globeCorePulseStrength: 0.38,
    globeRippleStrength: 0.32,
    globeHubOrbitEnabled: true,
    globeHubOrbitStrength: 0.22,
    globeHubOrbitSpeed: 0.24,
    globeHubOrbitRadiusFactor: 0.2,
    globeSphereEllipsoidX: 1.08,
    globeSphereEllipsoidY: 0.88,
    globeSphereEllipsoidZ: 1,
    globeLabelDepthFade: true,
    globeLabelBackfaceCulling: true,
    selection: {
      selectedNodeGlowIntensity: 0.8,
      dimmedNodeOpacity: 0.2,
      dimmedEdgeOpacity: 0.2,
      selectedEdgeWidth: 3,
      selectedEdgeColor: MVP_COLOR_PALETTE.nodes.idea,
    },
  },
};

export function getNodeRadiusFromSchema(node: GraphNode, schema: GraphSchema): number {
  const nodeSizes = schema.nodeSizes || {};
  const properties = node.properties || {};
  const rawRadius = (properties as Record<string, unknown>)['visual:radius']
  if (typeof rawRadius === 'number' && Number.isFinite(rawRadius) && rawRadius > 0) {
    return rawRadius
  }
  const rawSize = properties['visual:nodeSize'];
  if (typeof rawSize === 'number' && Number.isFinite(rawSize) && rawSize > 0) {
    return rawSize;
  }
  const sizingFormula = schema.three?.nodeSizingFormula || 'schema';
  if (sizingFormula === 'importance') {
    const importance = properties['visual:importance'];
    if (typeof importance === 'number' && Number.isFinite(importance) && importance > 0) {
      const radius = Math.sqrt(importance) * 2;
      const min = 10;
      const max = 40;
      const clamped = Math.max(min, Math.min(max, radius));
      if (Number.isFinite(clamped) && clamped > 0) {
        return clamped;
      }
    }
  }
  const fallbackRadius = nodeSizes[node.type]?.radius;
  if (typeof fallbackRadius === 'number' && Number.isFinite(fallbackRadius) && fallbackRadius > 0) {
    return fallbackRadius;
  }
  return 10;
}

function getKeywordNodeSizeScale(schema: GraphSchema): number {
  const v = schema.three?.keywordNodeSizeScale
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1
  return Math.max(0.2, Math.min(5, v))
}

export function getNodeRenderRadius(node: GraphNode, schema: GraphSchema): number {
  const props = (node.properties || {}) as Record<string, unknown>
  const kind = props ? props['keyword:kind'] : undefined
  const scale = typeof kind === 'string' && kind.trim() !== '' ? getKeywordNodeSizeScale(schema) : 1
  return getNodeRadiusFromSchema(node, schema) * scale
}
