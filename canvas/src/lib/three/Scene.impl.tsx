import React from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { resolveCssVar } from '@/lib/ui/theme-tokens'
import { getThreeConfig, getRendererPalette, MVP_COLOR_PALETTE } from '@/lib/graph/schema'
import { computeNeighborIds } from '@/components/GraphCanvas/highlight'
import { getRenderNodeRadius2d, getEdgeStrokeWidth } from '@/components/GraphCanvas/helpers'
import { getEdgeBaseStroke } from '@/lib/graph/visualStyles'
import { Physics3D, type Vec3 } from '@/features/three/layout'
import type { NodeSelectionMode } from '@/features/three/selection'
import { getSelectionVisuals } from '@/features/three/selection'
import { DirectionalParticles, ArrowHead, EdgeMesh, CurvedEdgeMesh, ShaderLineEdges } from '@/features/three/visuals'
import { NodeMesh } from '@/features/three/NodeMesh'
import { Starfield } from '@/features/three/Starfield'
import { GlobeEffects } from '@/features/three/GlobeEffects'
import { getCameraConfig } from '@/features/three/camera'
import { resolveThreeColor } from '@/features/three/resolveColor'
import type { KgTheme } from '@/lib/ui/tokens-ssot'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'
import { buildDeepestGroupRectByNodeId, buildGroupRectByIdFromSchemaOverrides } from '@/lib/canvas/groupExplicitBounds'
import { clampNodeCenterToRect } from '@/lib/canvas/groupContainment'
import { GroupOverlays3d } from '@/features/three/GroupOverlays'
import { THREE_RENDER_ORDER } from '@/features/three/renderOrder'
import { readThreeRenderOrderOffset } from '@/features/three/zOrder'
import { readEdgePathCurveOptions, readGlobalEdgeType } from '@/lib/graph/edgeTypes'
import type { Canvas3dModeId } from '@/lib/config'
import { resolveVoxelClusterColor, resolveVoxelClusterKey } from '@/features/three/voxelStyle'
import { quantizeVoxelCoordToCellCenter, quantizeVoxelCoordToGridLine, resolveVoxelGridStep, resolveVoxelLayerSpacing } from '@/features/three/threeLayoutConfig'
import { intersectRayWithZPlane } from '@/features/three/raycast'
import { listVoxelLayers, resolveVoxelLayerKey } from '@/features/three/voxelLayers'
import { VoxelDistricts, VoxelDistrictAmbientField } from '@/features/three/VoxelDistricts'
import { VoxelBridgeTubes } from '@/features/three/VoxelBridgeTubes'
import { XrSceneStage, type XrGraphStageAuthority } from '@/features/three/XrSceneStage'
import { buildSelectionAnchorIdSets } from '@/lib/selection/anchorIds'
import { buildSelectedEdgeEndpointNodeIdSet } from '@/lib/graph/edgeEndpoints'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
const clamp01 = (v: number): number => {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}
const easeOutCubic = (t: number): number => {
  const u = 1 - clamp01(t)
  return 1 - u * u * u
}
const VOXEL_CLUSTER_PULSE_RING_COLOR = '#ff3b3b'

function VoxelLayerPlates({
  plates,
  span,
  opacity,
  gridStep,
  riseDurationMs,
  riseStaggerMs,
  enabledKey,
}: {
  plates: Array<{ key: string; z: number; color: string }>
  span: number
  opacity: number
  gridStep: number
  riseDurationMs: number
  riseStaggerMs: number
  enabledKey: string
}) {
  const meshByKeyRef = React.useRef<Record<string, THREE.Mesh | null>>({})
  const startTRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    startTRef.current = null
  }, [enabledKey])
  useFrame(({ clock }) => {
    if (plates.length === 0) return
    const t0 = startTRef.current
    const now = clock.getElapsedTime()
    if (t0 == null) {
      startTRef.current = now
      return
    }
    const dt = Math.max(0, now - t0)
    const dur = Math.max(0.08, riseDurationMs / 1000)
    const stag = Math.max(0, riseStaggerMs / 1000)
    const riseDist = Math.max(24, Math.min(420, gridStep * 7))
    for (let i = 0; i < plates.length; i += 1) {
      const plate = plates[i]!
      const mesh = meshByKeyRef.current[plate.key]
      if (!mesh) continue
      const p = clamp01((dt - i * stag) / dur)
      const e = easeOutCubic(p)
      mesh.position.z = (plate.z - 0.6) - riseDist * (1 - e)
    }
  })
  if (!plates.length || !(span > 0)) return null
  return (
    <group>
      {plates.map((p) => (
        <mesh
          key={p.key}
          ref={(el) => {
            meshByKeyRef.current[p.key] = el
          }}
          position={[0, 0, p.z - 0.6]}
          renderOrder={THREE_RENDER_ORDER.groups - 4}
        >
          <planeGeometry args={[span, span]} />
          <meshStandardMaterial
            color={p.color}
            transparent
            opacity={opacity}
            roughness={0.95}
            metalness={0.08}
            emissive={p.color}
            emissiveIntensity={0.06}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

function VoxelClusterPulseRings({
  rings,
  strength,
  enabledKey,
}: {
  rings: Array<{ id: string; pos: [number, number, number]; r: number }>
  strength: number
  enabledKey: string
}) {
  const meshByIdRef = React.useRef<Record<string, THREE.Mesh | null>>({})
  const matByIdRef = React.useRef<Record<string, THREE.MeshBasicMaterial | null>>({})
  const startTRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    startTRef.current = null
  }, [enabledKey])
  useFrame(({ clock }) => {
    if (!rings.length) return
    const now = clock.getElapsedTime()
    if (startTRef.current == null) startTRef.current = now
    const t = now
    const s = Math.max(0, Math.min(1.2, strength))
    const baseOpacity = 0.22 + s * 0.34
    for (let i = 0; i < rings.length; i += 1) {
      const r = rings[i]!
      const mesh = meshByIdRef.current[r.id]
      const mat = matByIdRef.current[r.id]
      if (!mesh || !mat) continue
      const phase = t * 1.6 + (r.id.length % 7) * 0.6
      const pulse = 1 + Math.sin(phase) * (0.06 + s * 0.12)
      mesh.scale.set(pulse, pulse, 1)
      mat.opacity = clamp01(baseOpacity + Math.sin(phase * 1.1) * (0.06 + s * 0.12))
    }
  })
  if (!rings.length) return null
  return (
    <group>
      {rings.map((r) => (
        <mesh
          key={r.id}
          ref={(el) => {
            meshByIdRef.current[r.id] = el
          }}
          position={r.pos}
          renderOrder={THREE_RENDER_ORDER.edges - 1}
        >
          <ringGeometry args={[Math.max(1, r.r * 0.86), Math.max(1.2, r.r), 72]} />
          <meshBasicMaterial
            ref={(m) => {
              matByIdRef.current[r.id] = m
            }}
            color={VOXEL_CLUSTER_PULSE_RING_COLOR}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

export function Scene({
  data,
  schema,
  positions,
  paused,
  onSelectNode,
  onHoverNode,
  onHoverEdge,
  onHoverEdgeIdChange,
  hoveredEdgeId,
  onDragNode,
  draggedNodeId,
  theme,
  dragOverridesRef,
  hiddenNodeIdSet,
  mode = '3d',
  xrGraphStageAuthority,
  backgroundColor, geospatialComposite,
}: {
  data: GraphData;
  schema: GraphSchema;
  positions: Record<string, Vec3>;
  paused?: boolean;
  onSelectNode: (id: string) => void;
  onHoverNode?: (info: { id: string; clientX: number; clientY: number } | null) => void;
  onHoverEdge?: (info: { id: string; clientX: number; clientY: number } | null) => void;
  onHoverEdgeIdChange?: (id: string | null) => void;
  hoveredEdgeId?: string | null;
  onDragNode?: (id: string | null) => void;
  draggedNodeId?: string | null;
  theme?: KgTheme;
  dragOverridesRef?: React.MutableRefObject<Record<string, Vec3>>;
  hiddenNodeIdSet?: Set<string>;
  mode?: Canvas3dModeId;
  xrGraphStageAuthority?: XrGraphStageAuthority;
  backgroundColor: string; geospatialComposite?: boolean;
}) {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId)
  const selectedNodeIds = useGraphStore(s => s.selectedNodeIds)
  const selectedEdgeIds = useGraphStore(s => s.selectedEdgeIds)
  const selectEdge = useGraphStore(s => s.selectEdge)
  const setSelectionSource = useGraphStore(s => s.setSelectionSource)
  const updateNode = useGraphStore(s => s.updateNode)
  const renderMediaAsNodes = useGraphStore(s => s.renderMediaAsNodes)
  const threeEdgeRenderer = useGraphStore(s => s.threeEdgeRenderer)
  const threeShaderLineWidthPx = useGraphStore(s => s.threeShaderLineWidthPx)
  const selectionSets = React.useMemo(() => {
    const { selectedNodeIdSet, selectedEdgeIdSet } = buildSelectionAnchorIdSets({
      selectedNodeId,
      selectedEdgeId,
      selectedNodeIds,
      selectedEdgeIds,
    })
    const selectedEdgeEndpointNodeIdSet = buildSelectedEdgeEndpointNodeIdSet(data.edges, selectedEdgeIdSet)
    return { selectedNodeIdSet, selectedEdgeIdSet, selectedEdgeEndpointNodeIdSet }
  }, [data.edges, selectedEdgeId, selectedEdgeIds, selectedNodeId, selectedNodeIds])
  const neighborIds = React.useMemo(
    () =>
      computeNeighborIds({
        data,
        schema,
        selectedNodeId,
        selectedEdgeId,
        selectedNodeIds,
        selectedEdgeIds,
        renderMediaAsNodes,
      }),
    [data, schema, selectedNodeId, selectedEdgeId, selectedNodeIds, selectedEdgeIds, renderMediaAsNodes],
  )
  const selectionMode: NodeSelectionMode =
    selectionSets.selectedEdgeIdSet.size > 0 ? 'edge' : selectionSets.selectedNodeIdSet.size > 0 ? 'node' : 'none'

  const nodeById = React.useMemo(() => {
    const m = new Map<string, GraphNode>()
    for (let i = 0; i < data.nodes.length; i += 1) {
      const n = data.nodes[i]
      const id = String(n?.id || '').trim()
      if (id && !m.has(id)) m.set(id, n)
    }
    return m
  }, [data.nodes])

  const groups = React.useMemo(() => deriveGraphGroups(data), [data])
  const explicitGroupRectById = React.useMemo(() => {
    if (!groups.length) return new Map<string, { x: number; y: number; width: number; height: number }>()
    return buildGroupRectByIdFromSchemaOverrides({ groups: groups as any, graphNodes: data.nodes as GraphNode[], schema })
  }, [data.nodes, groups, schema])
  const explicitGroupRectByNodeId = React.useMemo(() => {
    if (!groups.length || explicitGroupRectById.size === 0) return new Map<string, { x: number; y: number; width: number; height: number }>()
    return buildDeepestGroupRectByNodeId({ groups: groups as any, groupRectById: explicitGroupRectById as any })
  }, [explicitGroupRectById, groups])
  const {
    neutralEdgeColor,
    selectedEdgeColor,
    palette,
    colorByEdge
  } = React.useMemo(() => {
    // We include theme in dependency to force re-evaluation
    void theme

    const palette = getRendererPalette(schema)
    const neutralEdgeColorRaw = palette.edges.neutral || MVP_COLOR_PALETTE.edges.neutral
    const neutralEdgeColor = resolveThreeColor(neutralEdgeColorRaw, MVP_COLOR_PALETTE.edges.neutral)
    const colorByEdge = (e: import('@/lib/graph/types').GraphEdge) => {
      const raw = getEdgeBaseStroke(e, schema)
      return resolveThreeColor(raw, neutralEdgeColor)
    }
    const selectionVisuals = getSelectionVisuals(schema)
    const selectedEdgeColor = resolveThreeColor(selectionVisuals.selectedEdgeColor, neutralEdgeColor)
    return { neutralEdgeColor, selectedEdgeColor, palette, colorByEdge }
  }, [schema, theme])

  const selectionVisuals = React.useMemo(() => getSelectionVisuals(schema), [schema])

  const nodeRadiusMap = React.useMemo(() => {
    const map = new Map<string, number>()
    if (data.nodes) {
      for (const n of data.nodes) {
        const r = getRenderNodeRadius2d(n, schema)
        map.set(n.id, r)
      }
    }
    return map
  }, [data.nodes, schema])

  const threeCfg = getThreeConfig(schema)
  const motionIntensity = typeof threeCfg.nodeMotionIntensity === 'number'
    ? Math.max(0, Math.min(2, threeCfg.nodeMotionIntensity))
    : 1
  const motionIntensityEffective = renderMediaAsNodes ? 0 : motionIntensity

  const cameraConfig = getCameraConfig(schema)
  const hiddenNodeIds = hiddenNodeIdSet || null
  const backgroundColorEffective = backgroundColor
  const arrowLenDefault = typeof threeCfg.linkDirectionalArrowLength === 'number' ? Math.max(2, Math.min(24, threeCfg.linkDirectionalArrowLength)) : 8
  const linkOpacityDefault = typeof threeCfg.linkOpacity === 'number'
    ? Math.max(0, Math.min(1, threeCfg.linkOpacity))
    : (mode === 'voxel' ? 0.18 : 0.6)
  const linkCurvatureDefault = typeof threeCfg.linkCurvature === 'number' ? Math.max(0, Math.min(1.5, threeCfg.linkCurvature)) : 0
  const globalEdgeType = readGlobalEdgeType(schema)
  const linkCurvatureByEdgeType = (() => {
    if (globalEdgeType === 'straight' || globalEdgeType === 'step') return 0
    if (globalEdgeType === 'smoothstep') return Math.max(linkCurvatureDefault, 0.2)
    return linkCurvatureDefault
  })()
  const curveRotationDefault = typeof threeCfg.linkCurveRotation === 'number' ? threeCfg.linkCurveRotation : 0
  const arrowRelPosDefault = typeof threeCfg.linkDirectionalArrowRelPos === 'number'
    ? Math.max(0, Math.min(1, threeCfg.linkDirectionalArrowRelPos))
    : 0.85
  const particlesDefault = typeof threeCfg.linkDirectionalParticles === 'number'
    ? Math.max(0, Math.min(64, Math.floor(threeCfg.linkDirectionalParticles)))
    : 0
  const particleSpeedDefault = typeof threeCfg.linkDirectionalParticleSpeed === 'number'
    ? Math.max(0.01, Math.min(5, threeCfg.linkDirectionalParticleSpeed))
    : 0.6
  const opacityByLabel: Record<string, number> = threeCfg.edgeOpacityByLabel || {}
  const starfieldEnabled = !!threeCfg.starfieldEnabled
  const starfieldCountRaw = typeof threeCfg.starfieldCount === 'number' ? threeCfg.starfieldCount : 0
  const starfieldCount = Math.max(0, Math.min(10000, Math.floor(starfieldCountRaw)))
  const starfieldRadiusRaw = typeof threeCfg.starfieldRadius === 'number' ? threeCfg.starfieldRadius : (typeof schema.three?.sphereRadius === 'number' ? schema.three.sphereRadius : 260)
  const starfieldRadius = Math.max(40, Math.min(1200, starfieldRadiusRaw))
  const starfieldOpacityRaw = typeof threeCfg.starfieldOpacity === 'number' ? threeCfg.starfieldOpacity : 0.9
  const starfieldOpacity = Math.max(0, Math.min(1, starfieldOpacityRaw))
  const starfieldColorRaw = React.useMemo(() => {
    void theme
    return typeof threeCfg.starfieldColor === 'string' && threeCfg.starfieldColor.trim() !== ''
      ? threeCfg.starfieldColor
      : (palette.nodes.hypothesis || MVP_COLOR_PALETTE.nodes.hypothesis)
  }, [threeCfg.starfieldColor, palette, theme])
  const localDragOverridesRef = React.useRef<Record<string, Vec3>>({})
  const dragRef = dragOverridesRef || localDragOverridesRef
  const dragProjectionRef = React.useRef<Record<string, { plane: THREE.Plane; offset: THREE.Vector3 }>>({})
  const voxelGridStep = resolveVoxelGridStep(schema)
  const voxelLayerSpacing = resolveVoxelLayerSpacing(schema)
  const voxelSnapEnabled = schema?.behavior?.snapGrid?.enabled === true
  const voxelGridVisualEnabled = schema?.behavior?.canvasGrid?.enabled === true
  const snapVoxelDragPoint = React.useCallback((x: number, y: number, z: number): Vec3 => {
    if (!voxelSnapEnabled) return [x, y, z]
    const sx = quantizeVoxelCoordToCellCenter(x, voxelGridStep)
    const sy = quantizeVoxelCoordToCellCenter(y, voxelGridStep)
    return [sx, sy, z]
  }, [voxelGridStep, voxelSnapEnabled])
  const resolveVoxelDragPlaneZ = React.useCallback((id: string): number => {
    const p = positions[String(id)]
    const z = p ? Number(p[2]) : 0
    return Number.isFinite(z) ? z : 0
  }, [positions])
  const resolveDraggedPosition = React.useCallback((id: string, e: ThreeEvent<PointerEvent>): Vec3 => {
    if (mode === 'voxel') {
      const z = resolveVoxelDragPlaneZ(id)
      const hit = intersectRayWithZPlane(e.ray, z) || e.point
      return snapVoxelDragPoint(hit.x, hit.y, z)
    }
    let projection = dragProjectionRef.current[id]
    if (!projection) {
      const base = dragRef.current[id] || positions[id] || [e.point.x, e.point.y, e.point.z]
      const center = new THREE.Vector3(base[0], base[1], base[2])
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(e.ray.direction.clone().normalize(), e.point)
      projection = { plane, offset: center.sub(e.point) }
      dragProjectionRef.current[id] = projection
    }
    const hit = e.ray.intersectPlane(projection.plane, new THREE.Vector3()) || e.point.clone()
    const p = hit.add(projection.offset)
    const rect = explicitGroupRectByNodeId.get(String(id)) || null
    const n = nodeById.get(String(id)) || null
    if (rect && n) {
      const r = getRenderNodeRadius2d(n, schema)
      const clamped = clampNodeCenterToRect({ cx: p.x, cy: p.y, halfW: r, halfH: r, rect })
      p.x = clamped.cx
      p.y = clamped.cy
    }
    return [p.x, p.y, p.z]
  }, [dragRef, explicitGroupRectByNodeId, mode, nodeById, positions, resolveVoxelDragPlaneZ, schema, snapVoxelDragPoint])
  const handleDragStart = React.useCallback((id: string, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    delete dragProjectionRef.current[id]
    dragRef.current[id] = resolveDraggedPosition(id, e)
  }, [dragRef, resolveDraggedPosition])
  const handleDrag = React.useCallback((id: string, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    dragRef.current[id] = resolveDraggedPosition(id, e)
  }, [dragRef, resolveDraggedPosition])
  const handleDragEnd = React.useCallback((id: string, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const position = resolveDraggedPosition(id, e)
    dragRef.current[id] = position
    delete dragProjectionRef.current[id]
    const node = nodeById.get(String(id))
    updateNode(id, {
      properties: {
        ...(node?.properties || {}),
        pos3d: [...position],
      },
    } as Partial<GraphNode>)
    requestAnimationFrame(() => {
      delete dragRef.current[id]
    })
  }, [dragRef, nodeById, resolveDraggedPosition, updateNode])
  const allowNodeDrag = schema.behavior ? schema.behavior.allowNodeDrag !== false : true
  const voxelClusterLightIntensity = (() => {
    const raw = schema.three?.voxelClusterLightIntensity
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0.7
    return Math.max(0, Math.min(2, raw))
  })()
  const voxelEdgeHoverOpacity = (() => {
    const raw = schema.three?.voxelEdgeHoverOpacity
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0.65
    return Math.max(0, Math.min(1, raw))
  })()
  const voxelAnimationEnabled = schema.three?.voxelAnimationEnabled !== false
  const voxelLayerPlatesEnabled = voxelAnimationEnabled
  const voxelLayerPlateOpacity = (() => {
    const raw = schema.three?.voxelLayerPlateOpacity
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0.06
    return Math.max(0, Math.min(0.45, raw))
  })()
  const voxelLayerPlateRiseDurationMs = (() => {
    const raw = schema.three?.voxelLayerPlateRiseDurationMs
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 900
    return Math.max(80, Math.min(6000, Math.floor(raw)))
  })()
  const voxelLayerPlateRiseStaggerMs = (() => {
    const raw = schema.three?.voxelLayerPlateRiseStaggerMs
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 160
    return Math.max(0, Math.min(2000, Math.floor(raw)))
  })()
  const voxelClusterPulseEnabled = voxelAnimationEnabled
  const voxelClusterPulseStrength = (() => {
    const raw = schema.three?.voxelClusterPulseStrength
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0.22
    return Math.max(0, Math.min(1.2, raw))
  })()

  const voxelLayers = React.useMemo(() => {
    if (mode !== 'voxel') return []
    return listVoxelLayers(data.nodes)
  }, [data.nodes, mode])

  const voxelLayerPlates = React.useMemo(() => {
    if (mode !== 'voxel' || !voxelLayerPlatesEnabled || voxelLayers.length === 0) return [] as Array<{ key: string; z: number; color: string }>
    const zByKey = new Map<string, number>()
    for (let i = 0; i < data.nodes.length; i += 1) {
      const n = data.nodes[i]
      const p = positions[n.id]
      if (!p) continue
      const key = resolveVoxelLayerKey(n)
      const z = Number(p[2])
      if (!Number.isFinite(z)) continue
      const prev = zByKey.get(key)
      if (prev == null || z < prev) zByKey.set(key, z)
    }
    const out: Array<{ key: string; z: number; color: string }> = []
    for (let i = 0; i < voxelLayers.length; i += 1) {
      const key = voxelLayers[i]!.key
      const z = zByKey.get(key)
      const sample = data.nodes.find(n => resolveVoxelLayerKey(n) === key) || null
      const sampleProps = ((sample?.properties || {}) as Record<string, unknown>)
      const layerColorRaw = typeof sampleProps['layer:color'] === 'string' ? String(sampleProps['layer:color']).trim() : ''
      const color = layerColorRaw || (sample ? (resolveVoxelClusterColor(sample) || '#00f5ff') : '#00f5ff')
      const fallbackZ = quantizeVoxelCoordToGridLine(i * voxelLayerSpacing, voxelGridStep)
      out.push({ key, z: typeof z === 'number' && Number.isFinite(z) ? z : fallbackZ, color })
    }
    return out
  }, [data.nodes, mode, positions, voxelGridStep, voxelLayerPlatesEnabled, voxelLayerSpacing, voxelLayers])

  const voxelClusterRings = React.useMemo(() => {
    if (mode !== 'voxel' || !voxelClusterPulseEnabled) return [] as Array<{ id: string; pos: [number, number, number]; r: number }>
    const stats = new Map<string, { x: number; y: number; z: number; count: number; maxR2: number }>()
    for (let i = 0; i < data.nodes.length; i += 1) {
      const n = data.nodes[i]
      const p = positions[n.id]
      if (!p) continue
      const g = resolveVoxelClusterKey(n)
      if (!g) continue
      const x = Number(p[0])
      const y = Number(p[1])
      const z = Number(p[2])
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
      const prev = stats.get(g)
      if (!prev) {
        stats.set(g, { x, y, z, count: 1, maxR2: 0 })
      } else {
        prev.x += x
        prev.y += y
        prev.z += z
        prev.count += 1
      }
    }
    const centers = new Map<string, { cx: number; cy: number; cz: number }>()
    for (const [id, v] of stats.entries()) {
      const inv = v.count > 0 ? 1 / v.count : 1
      centers.set(id, { cx: v.x * inv, cy: v.y * inv, cz: v.z * inv })
    }
    for (let i = 0; i < data.nodes.length; i += 1) {
      const n = data.nodes[i]
      const p = positions[n.id]
      if (!p) continue
      const g = resolveVoxelClusterKey(n)
      if (!g) continue
      const c = centers.get(g)
      if (!c) continue
      const dx = Number(p[0]) - c.cx
      const dy = Number(p[1]) - c.cy
      const r2 = dx * dx + dy * dy
      const st = stats.get(g)
      if (st && Number.isFinite(r2) && r2 > st.maxR2) st.maxR2 = r2
    }
    const out: Array<{ id: string; pos: [number, number, number]; r: number }> = []
    for (const [id, v] of stats.entries()) {
      const c = centers.get(id)
      if (!c) continue
      const base = Math.sqrt(Math.max(0, v.maxR2))
      const r = Math.max(voxelGridStep * 4, base + voxelGridStep * 3)
      out.push({ id, pos: [c.cx, c.cy, c.cz + 0.8], r })
    }
    return out
  }, [data.nodes, mode, positions, voxelClusterPulseEnabled, voxelGridStep])
  const voxelGroupLights = React.useMemo(() => {
    if (mode !== 'voxel') return [] as Array<{ id: string; pos: [number, number, number]; color: string }>
    const byGroupId = new Map<string, { x: number; y: number; z: number; count: number }>()
    for (let i = 0; i < data.nodes.length; i += 1) {
      const n = data.nodes[i]
      const p = positions[n.id]
      if (!p) continue
      const g = resolveVoxelClusterKey(n)
      if (!g) continue
      const prev = byGroupId.get(g)
      if (prev) {
        prev.x += p[0]
        prev.y += p[1]
        prev.z += p[2]
        prev.count += 1
      } else {
        byGroupId.set(g, { x: p[0], y: p[1], z: p[2], count: 1 })
      }
    }
    const out: Array<{ id: string; pos: [number, number, number]; color: string }> = []
    for (const [id, v] of byGroupId.entries()) {
      const inv = v.count > 0 ? 1 / v.count : 1
      const sample = data.nodes.find(n => resolveVoxelClusterKey(n) === id)
      out.push({
        id,
        pos: [v.x * inv, v.y * inv, v.z * inv + 10],
        color: (sample && resolveVoxelClusterColor(sample)) || '#00f5ff',
      })
    }
    return out
  }, [data.nodes, mode, positions])

  const [voxelGround, setVoxelGround] = React.useState<{ span: number; divisions: number; gridStep: number } | null>(null)
  const voxelGroundRef = React.useRef<typeof voxelGround>(null)
  React.useEffect(() => {
    voxelGroundRef.current = voxelGround
  }, [voxelGround])
  const computeVoxelGround = React.useCallback((gridStep: number) => {
    const step = Math.max(1, gridStep)
    let maxAbs = 0
    const nodeCount = Array.isArray(data.nodes) ? data.nodes.length : 0
    for (let i = 0; i < nodeCount; i += 1) {
      const id = data.nodes[i].id
      const p = positions[id]
      if (!p) continue
      const ax = Math.abs(p[0])
      const ay = Math.abs(p[1])
      if (ax > maxAbs) maxAbs = ax
      if (ay > maxAbs) maxAbs = ay
    }
    const spanFromPositions = maxAbs > 0 ? (Math.ceil((maxAbs * 2 + step * 10) / step) * step) : 0
    const spanFromCount = Math.max(200, Math.ceil(Math.sqrt(Math.max(1, nodeCount))) * step * 8)
    const targetSpan = Math.max(spanFromCount, spanFromPositions)
    let divisions = Math.max(4, Math.min(320, Math.round(targetSpan / step)))
    if (divisions % 2 !== 0) divisions += 1
    const span = divisions * step
    return { span, divisions, gridStep: step }
  }, [data.nodes, positions])
  React.useEffect(() => {
    if (mode !== 'voxel' || !voxelGridVisualEnabled) {
      setVoxelGround(null)
      return
    }
    const next = computeVoxelGround(resolveVoxelGridStep(schema))
    setVoxelGround(prev => {
      if (!prev) return next
      if (prev.gridStep !== next.gridStep) return next
      if (prev.span !== next.span) return next
      return prev
    })
  }, [computeVoxelGround, mode, schema, voxelGridVisualEnabled])
  const voxelGroundFrameCounterRef = React.useRef(0)
  useFrame(() => {
    if (mode !== 'voxel' || !voxelGridVisualEnabled) return
    voxelGroundFrameCounterRef.current += 1
    if (voxelGroundFrameCounterRef.current % 18 !== 0) return
    const next = computeVoxelGround(resolveVoxelGridStep(schema))
    const prev = voxelGroundRef.current
    if (!prev || next.gridStep !== prev.gridStep || next.span > prev.span) {
      setVoxelGround(next)
    }
  })

  const motionIntensityForMode = mode === 'voxel' ? 0 : motionIntensityEffective
  const voxelGridMajorColor = (typeof (schema?.behavior?.canvasGrid as any)?.majorStroke === 'string' && String((schema?.behavior?.canvasGrid as any).majorStroke).trim() !== '')
    ? String((schema?.behavior?.canvasGrid as any).majorStroke).trim()
    : resolveCssVar('--kg-canvas-grid-major', '#334155')
  const voxelGridMinorColor = (typeof (schema?.behavior?.canvasGrid as any)?.minorStroke === 'string' && String((schema?.behavior?.canvasGrid as any).minorStroke).trim() !== '')
    ? String((schema?.behavior?.canvasGrid as any).minorStroke).trim()
    : resolveCssVar('--kg-canvas-grid-minor', '#1f2937')
  const voxelGridOpacity = (() => {
    const cur = schema?.behavior?.canvasGrid as any
    const minorA = typeof cur?.minorAlpha === 'number' && Number.isFinite(cur.minorAlpha) ? Math.max(0, Math.min(1, cur.minorAlpha)) : 0.06
    const majorA = typeof cur?.majorAlpha === 'number' && Number.isFinite(cur.majorAlpha) ? Math.max(0, Math.min(1, cur.majorAlpha)) : 0.12
    return Math.max(minorA, majorA)
  })()
  const voxelGridLineWidth = (() => {
    const cur = schema?.behavior?.canvasGrid as any
    const w = typeof cur?.minorWidthPx === 'number' && Number.isFinite(cur.minorWidthPx) ? cur.minorWidthPx : 1
    return Math.max(0.5, Math.min(4, w))
  })()
  const voxelGroundColor = backgroundColorEffective
  const voxelPlateSpan = React.useMemo(() => {
    if (mode !== 'voxel') return 0
    const span = voxelGround?.span
    if (typeof span === 'number' && Number.isFinite(span) && span > 0) return span
    try {
      return computeVoxelGround(voxelGridStep).span
    } catch {
      return 0
    }
  }, [computeVoxelGround, mode, voxelGridStep, voxelGround?.span])
  const voxelLayerLights = React.useMemo(() => {
    if (mode !== 'voxel') return [] as Array<{ key: string; pos: [number, number, number]; color: string }>
    if (!voxelLayerPlatesEnabled || voxelLayerPlates.length === 0) return []
    const lift = Math.max(24, Math.min(220, voxelLayerSpacing * 0.65))
    return voxelLayerPlates.map(p => ({ key: p.key, pos: [0, 0, p.z + lift] as [number, number, number], color: p.color }))
  }, [mode, voxelLayerPlates, voxelLayerPlatesEnabled, voxelLayerSpacing])
  const hoverEdgeKey = mode === 'voxel' && typeof hoveredEdgeId === 'string' && hoveredEdgeId.trim() ? hoveredEdgeId.trim() : null

  const fogColorEffective = mode === 'voxel'
    ? (cameraConfig.fogColor || backgroundColorEffective)
    : cameraConfig.fogColor
  const fogNearEffective = (mode === 'voxel' && !cameraConfig.fogColor)
    ? Math.max(20, voxelPlateSpan > 0 ? voxelPlateSpan * 0.35 : cameraConfig.fogNear)
    : cameraConfig.fogNear
  const fogFarEffective = (mode === 'voxel' && !cameraConfig.fogColor)
    ? Math.max(fogNearEffective + 1, voxelPlateSpan > 0 ? voxelPlateSpan * 1.35 : cameraConfig.fogFar)
    : cameraConfig.fogFar

  const sceneGroupRef = React.useRef<THREE.Group | null>(null)
  useFrame(({ clock }) => {
    if (paused) return
    const g = sceneGroupRef.current
    if (!g) return
    if (mode === 'voxel') {
      g.position.set(0, 0, 0)
      g.rotation.set(0, 0, 0)
      return
    }
    const t = clock.getElapsedTime()
    const i = motionIntensityEffective
    g.position.x = Math.sin(t * 0.12) * (0.08 * i)
    g.position.y = Math.cos(t * 0.15) * (0.08 * i)
    g.rotation.z = Math.sin(t * 0.04) * (0.002 * i)
    g.rotation.x = Math.cos(t * 0.05) * (0.0035 * i)
  })
  return (
    <>
      {mode !== 'xr' && fogColorEffective ? (
        mode === 'voxel'
          ? (
            <fogExp2
              attach="fog"
              args={[
                fogColorEffective,
                clamp(
                  (1 / Math.max(200, voxelPlateSpan || 200)) * 0.65,
                  0.0008,
                  0.004,
                ),
              ]}
            />
          )
          : (
            <fog attach="fog" args={[fogColorEffective, fogNearEffective, fogFarEffective]} />
          )
      ) : null}
      {mode === 'voxel' ? (
        <>
          <ambientLight intensity={0.55} />
          <directionalLight castShadow position={[120, 180, 200]} intensity={0.65} color={'#ffffff'} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <directionalLight castShadow position={[-160, -90, 80]} intensity={0.25} color={'#8090c0'} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <pointLight position={[0, 0, 160]} intensity={0.25} />
        </>
      ) : (
        <>
          <ambientLight intensity={0.9} />
          <hemisphereLight args={['#ffffff', '#cbd5e1', 0.6]} />
          <pointLight position={[120, 120, 120]} intensity={0.9} />
        </>
      )}
      {mode === 'voxel' && voxelGround && voxelGridVisualEnabled ? (
        <group>
          <gridHelper
            args={[voxelGround.span, voxelGround.divisions, voxelGridMajorColor, voxelGridMinorColor]}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
            material-transparent={true}
            material-opacity={voxelGridOpacity}
            material-linewidth={voxelGridLineWidth}
          />
          <gridHelper
            args={[voxelGround.span, Math.min(640, voxelGround.divisions * 2), voxelGridMinorColor, voxelGridMinorColor]}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0.03]}
            material-transparent={true}
            material-opacity={Math.max(0, Math.min(1, voxelGridOpacity * 0.55))}
            material-linewidth={Math.max(0.5, Math.min(3, voxelGridLineWidth * 0.8))}
          />
          <mesh position={[0, 0, -0.5]}>
            <planeGeometry args={[voxelGround.span, voxelGround.span]} />
            <meshStandardMaterial color={voxelGroundColor} transparent opacity={0.12} roughness={0.95} metalness={0.05} />
          </mesh>
        </group>
      ) : null}
      {mode === 'voxel' && voxelLayerPlatesEnabled && voxelLayerPlates.length > 0 && voxelPlateSpan > 0 ? (
        <VoxelLayerPlates
          plates={voxelLayerPlates}
          span={voxelPlateSpan}
          opacity={voxelLayerPlateOpacity}
          gridStep={voxelGridStep}
          riseDurationMs={voxelLayerPlateRiseDurationMs}
          riseStaggerMs={voxelLayerPlateRiseStaggerMs}
          enabledKey={`${voxelLayerPlates.map(p => p.key).join('|')}|${voxelPlateSpan}|${voxelLayerPlateRiseDurationMs}|${voxelLayerPlateRiseStaggerMs}`}
        />
      ) : null}
      {mode === 'voxel' && voxelClusterPulseEnabled && voxelClusterRings.length > 0 ? (
        <VoxelClusterPulseRings
          rings={voxelClusterRings}
          strength={voxelClusterPulseStrength}
          enabledKey={`${voxelClusterRings.length}|${voxelClusterPulseStrength}`}
        />
      ) : null}
      {mode === 'voxel'
        ? voxelGroupLights.map(light => (
          <pointLight key={light.id} position={light.pos} color={light.color} intensity={voxelClusterLightIntensity} distance={160} decay={2} />
        ))
        : null}
      {mode === 'voxel'
        ? voxelLayerLights.map(light => (
          <pointLight key={`layer:${light.key}`} position={light.pos} color={light.color} intensity={Math.max(0, Math.min(1.8, voxelClusterLightIntensity * 0.65))} distance={240} decay={2} />
        ))
        : null}
      {mode === '3d' && starfieldEnabled && starfieldCount > 0 ? (
        <Starfield
          count={starfieldCount}
          radius={starfieldRadius}
          opacity={starfieldOpacity}
          color={starfieldColorRaw}
          paused={paused}
        />
      ) : null}
      {mode === 'xr' ? <XrSceneStage authority={xrGraphStageAuthority} data={data} geospatialComposite={geospatialComposite} paused={Boolean(paused)} /> : null}
      {mode !== 'xr' ? <group ref={sceneGroupRef}>
        <Physics3D positions={positions} nodes={data.nodes} edges={data.edges} schema={schema} dragOverrides={dragRef} paused={paused} mode={mode} />
        {mode === 'voxel' ? (
          <>
            <VoxelDistricts nodes={data.nodes} positions={positions} schema={schema} paused={paused || !voxelAnimationEnabled} />
            <VoxelDistrictAmbientField nodes={data.nodes} positions={positions} schema={schema} paused={paused || !voxelAnimationEnabled} />
          </>
        ) : null}
        {mode === '3d' ? (
          <GlobeEffects
            data={data}
            schema={schema}
            positions={positions}
            edgeColor={neutralEdgeColor}
            nodeAccentColor={palette.nodes.hypothesis || MVP_COLOR_PALETTE.nodes.hypothesis}
          />
        ) : null}
        <GroupOverlays3d data={data} schema={schema} positions={positions} dragOverridesRef={dragRef} renderOrder={THREE_RENDER_ORDER.groups} />
        {mode === 'voxel' && threeEdgeRenderer === 'tubeBridge' ? (
          <VoxelBridgeTubes
            data={data}
            positions={positions}
            schema={schema}
            paused={paused || !voxelAnimationEnabled}
            hoveredEdgeId={hoverEdgeKey}
            onSelectEdge={(id) => {
              setSelectionSource('canvas')
              selectEdge(id)
            }}
            onHoverEdge={onHoverEdge}
            onHoverEdgeIdChange={onHoverEdgeIdChange}
          />
        ) : (threeEdgeRenderer === 'shaderLine' || (threeEdgeRenderer === 'tubeBridge' && mode !== 'voxel')) ? (
          <ShaderLineEdges
            edges={data.edges}
            positions={positions}
            nodeRadiusById={nodeRadiusMap}
            colorByEdge={colorByEdge}
            neutralEdgeColor={neutralEdgeColor}
            selectedEdgeColor={selectedEdgeColor}
            selectionMode={selectionMode}
            selectedEdgeIdSet={selectionSets.selectedEdgeIdSet}
            selectedNodeIdSet={selectionSets.selectedNodeIdSet}
            dimmedEdgeOpacity={selectionVisuals.dimmedEdgeOpacity}
            selectedEdgeWidth={selectionVisuals.selectedEdgeWidth}
            hoveredEdgeId={hoverEdgeKey}
            hoverOpacity={mode === 'voxel' ? voxelEdgeHoverOpacity : undefined}
            opacity={linkOpacityDefault}
            introEnabled={mode === 'voxel' && voxelAnimationEnabled}
            introDelayMs={schema.three?.voxelIntroDelayMs ?? 320}
            introDurationMs={schema.three?.voxelIntroDurationMs ?? 1100}
            paused={paused}
            motionIntensity={motionIntensityForMode}
            draggedNodeId={draggedNodeId}
            dragOverridesRef={dragRef}
            lineWidthPx={threeShaderLineWidthPx}
            renderOrder={THREE_RENDER_ORDER.edges}
            onSelectEdge={(id) => {
              setSelectionSource('canvas')
              selectEdge(id)
            }}
            onHoverEdge={onHoverEdge}
            onHoverEdgeIdChange={onHoverEdgeIdChange}
          />
        ) : (
          data.edges.map((e) => {
          const a = positions[e.source]
          const b = positions[e.target]
          if (!a || !b) return null
          void hiddenNodeIds
          const props = e.properties || {}
          const parseRgba = (value: string): { color: string; alpha: number } | null => {
            const m = value.match(/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([0-9]*\.?[0-9]+)\s*\)$/i)
            if (!m) return null
            const r = Number(m[1])
            const g = Number(m[2])
            const b = Number(m[3])
            const a = Number(m[4])
            if (![r, g, b, a].every(Number.isFinite)) return null
            const rr = Math.max(0, Math.min(255, Math.floor(r)))
            const gg = Math.max(0, Math.min(255, Math.floor(g)))
            const bb = Math.max(0, Math.min(255, Math.floor(b)))
            const aa = Math.max(0, Math.min(1, a))
            return { color: `rgb(${rr}, ${gg}, ${bb})`, alpha: aa }
          }
          const baseStroke = getEdgeBaseStroke(e, schema)
          const rgba = baseStroke ? parseRgba(String(baseStroke || '').trim()) : null
          const baseColor = rgba?.color || baseStroke || neutralEdgeColor
          const color = baseColor
          const baseWidth = getEdgeStrokeWidth(e, schema)
          let width = clamp(baseWidth, 0.5, 5)
          const curveOptions = readEdgePathCurveOptions(e, schema)
          const bendAbs = curveOptions ? Math.max(0, Math.min(0.8, Math.abs(curveOptions.bend))) : 0
          const linkOpacity = typeof props['opacity'] === 'number'
            ? Math.max(0, Math.min(1, props['opacity'] as number))
            : (rgba ? rgba.alpha : (typeof opacityByLabel[e.label] === 'number' ? Math.max(0, Math.min(1, opacityByLabel[e.label] as number)) : linkOpacityDefault))
          const curvature = (() => {
            if (globalEdgeType === 'straight' || globalEdgeType === 'step') return 0
            if (globalEdgeType === 'smoothstep') {
              const raw = typeof props['curvature'] === 'number' ? Math.max(0, Math.min(1.5, props['curvature'] as number)) : linkCurvatureByEdgeType
              return Math.max(0.2, Math.max(raw, raw * (0.72 + bendAbs)))
            }
            const raw = typeof props['curvature'] === 'number' ? Math.max(0, Math.min(1.5, props['curvature'] as number)) : linkCurvatureByEdgeType
            return Math.max(0, Math.min(1.5, Math.max(raw, raw * (0.68 + bendAbs))))
          })()
          const arrowLen = typeof props['arrowLength'] === 'number' ? Math.max(2, Math.min(24, props['arrowLength'] as number)) : arrowLenDefault
          const arrowColor = typeof props['arrowColor'] === 'string' ? String(props['arrowColor']) : color
          const resolution = typeof props['resolution'] === 'number' ? Math.floor(props['resolution'] as number) : 24
          const arrowRelPos = typeof props['arrowRelPos'] === 'number'
            ? Math.max(0, Math.min(1, props['arrowRelPos'] as number))
            : arrowRelPosDefault
          const curveRotation = (() => {
            const raw = typeof props['curveRotation'] === 'number' ? (props['curveRotation'] as number) : curveRotationDefault
            const bend = curveOptions ? curveOptions.bend : 0
            const sign = bend < 0 ? -1 : bend > 0 ? 1 : curveOptions ? curveOptions.phase : 1
            if (sign < 0) return raw + Math.PI
            return raw
          })()
          const particles = typeof props['linkDirectionalParticles'] === 'number'
            ? Math.max(0, Math.min(64, Math.floor(props['linkDirectionalParticles'] as number)))
            : particlesDefault
          const particleSpeed = typeof props['linkDirectionalParticleSpeed'] === 'number'
            ? Math.max(0.01, Math.min(5, props['linkDirectionalParticleSpeed'] as number))
            : particleSpeedDefault
          const srcId = e.source as string
          const tgtId = e.target as string
          const srcRadius = nodeRadiusMap.get(srcId) || 5
          const tgtRadius = nodeRadiusMap.get(tgtId) || 5
          const isSelectedEdge = selectionSets.selectedEdgeIdSet.has(e.id)
          const isIncidentToSelectedNode = selectionSets.selectedNodeIdSet.size > 0 && (selectionSets.selectedNodeIdSet.has(srcId) || selectionSets.selectedNodeIdSet.has(tgtId))
          let finalColor = arrowColor || color
          let finalOpacity = linkOpacity
          const selectedEdgeWidth = selectionVisuals.selectedEdgeWidth
          const dimmedEdgeOpacity = selectionVisuals.dimmedEdgeOpacity
          if (selectionMode === 'edge') {
            if (isSelectedEdge) {
              finalColor = selectedEdgeColor
              finalOpacity = Math.max(finalOpacity, 0.9)
              width = Math.max(width, selectedEdgeWidth)
            } else {
              finalColor = neutralEdgeColor
              finalOpacity = Math.min(finalOpacity, dimmedEdgeOpacity)
              width = Math.max(1, Math.min(baseWidth, selectedEdgeWidth * 0.5))
            }
          } else if (selectionMode === 'node') {
            if (isIncidentToSelectedNode) {
              finalColor = selectedEdgeColor
              finalOpacity = Math.max(finalOpacity, 0.9)
              width = Math.max(width, selectedEdgeWidth)
            } else {
              finalColor = baseColor
              finalOpacity = Math.min(finalOpacity, dimmedEdgeOpacity)
              width = Math.max(1, Math.min(baseWidth, selectedEdgeWidth * 0.5))
            }
          }
          if (hoverEdgeKey && hoverEdgeKey === String(e.id) && voxelEdgeHoverOpacity > 0) {
            finalOpacity = Math.max(finalOpacity, voxelEdgeHoverOpacity)
          }
          const resolvedFinalColor = resolveThreeColor(finalColor, neutralEdgeColor)
          return (
            <group
              key={e.id}
              name={`kg_edge:${e.id}`}
              renderOrder={THREE_RENDER_ORDER.edges + readThreeRenderOrderOffset(props as Record<string, unknown>)}
              onClick={(evt) => {
                evt.stopPropagation()
                setSelectionSource('canvas')
                selectEdge(e.id)
              }}
              onPointerOver={(evt: ThreeEvent<PointerEvent>) => {
                onHoverEdgeIdChange?.(e.id)
                if (onHoverEdge) {
                  onHoverEdge({ id: e.id, clientX: evt.clientX, clientY: evt.clientY })
                }
              }}
              onPointerMove={(evt: ThreeEvent<PointerEvent>) => {
                if (onHoverEdge) {
                  onHoverEdge({ id: e.id, clientX: evt.clientX, clientY: evt.clientY })
                }
              }}
              onPointerOut={() => {
                onHoverEdgeIdChange?.(null)
                if (onHoverEdge) {
                  onHoverEdge(null)
                }
              }}
            >
              {curvature > 0.001
                ? <CurvedEdgeMesh a={a} b={b} color={resolvedFinalColor} width={width} opacity={finalOpacity} curvature={curvature} resolution={resolution} rotation={curveRotation} paused={paused} name={`kg_edge:${e.id}`} sourceId={srcId} targetId={tgtId} sourceRadius={srcRadius} targetRadius={tgtRadius} motionIntensity={motionIntensityForMode} draggedNodeId={draggedNodeId} dragOverridesRef={dragRef} />
                : <EdgeMesh a={a} b={b} color={resolvedFinalColor} width={width} opacity={finalOpacity} resolution={resolution} paused={paused} name={`kg_edge:${e.id}`} sourceId={srcId} targetId={tgtId} sourceRadius={srcRadius} targetRadius={tgtRadius} motionIntensity={motionIntensityForMode} draggedNodeId={draggedNodeId} dragOverridesRef={dragRef} />
              }
              <ArrowHead start={a} end={b} color={resolvedFinalColor} height={arrowLen} relPos={arrowRelPos} paused={paused} name={`kg_edge:${e.id}`} sourceId={srcId} targetId={tgtId} sourceRadius={srcRadius} targetRadius={tgtRadius} motionIntensity={motionIntensityForMode} draggedNodeId={draggedNodeId} dragOverridesRef={dragRef} />
              {particles > 0 && particleSpeed > 0 ? (
                <DirectionalParticles start={a} end={b} count={particles} color={resolvedFinalColor} speed={particleSpeed} paused={paused} name={`kg_edge:${e.id}`} sourceId={srcId} targetId={tgtId} sourceRadius={srcRadius} targetRadius={tgtRadius} motionIntensity={motionIntensityForMode} draggedNodeId={draggedNodeId} dragOverridesRef={dragRef} />
              ) : null}
            </group>
          )
        })
        )}
        {data.nodes.map((n) => {
          const p = positions[n.id]
          if (!p) return null
          if (hiddenNodeIds && hiddenNodeIds.has(String(n.id))) return null
          const isSelected = selectionSets.selectedNodeIdSet.has(n.id)
          const isNeighbor = neighborIds.has(n.id)
          const isEdgeEndpoint = selectionSets.selectedEdgeEndpointNodeIdSet.has(n.id)
          const nodeProps = (n.properties || {}) as Record<string, unknown>
          return (
            <NodeMesh
              key={n.id}
              node={n}
              pos={p}
              schema={schema}
              renderOrder={THREE_RENDER_ORDER.nodes + readThreeRenderOrderOffset(nodeProps)}
              onClick={onSelectNode}
              selection={{ mode: selectionMode, isSelected, isNeighbor, isEdgeEndpoint }}
              visuals={selectionVisuals}
              paused={paused}
              onDragStart={allowNodeDrag ? handleDragStart : undefined}
              onDrag={allowNodeDrag ? handleDrag : undefined}
              onDragEnd={allowNodeDrag ? handleDragEnd : undefined}
              onHoverChange={onHoverNode}
              setNodeDragActive={allowNodeDrag ? onDragNode : undefined}
              motionIntensity={motionIntensityForMode}
              draggedNodeId={draggedNodeId}
              dragOverridesRef={dragRef}
              mode={mode}
            />
          )
        })}
      </group> : null}
    </>
  )
}
