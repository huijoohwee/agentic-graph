import React, { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { getThreeConfig, getRendererPalette, MVP_COLOR_PALETTE } from '@/lib/graph/schema'
import { getNodeMediaSpec, getLayerOpacity, getNodeBaseFill, getRenderNodeRadius2d, getVisualOpacity } from '@/components/GraphCanvas/helpers'
import { getNodeRectDimensions2d, getNodeRenderShape2d } from '@/components/GraphCanvas/nodeSizing2d'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { NodeSelectionState, SelectionVisuals } from './selection'
import type { Vec3 } from './layout'
import { computeNodeMotion, type NodeMotionState } from './animation'
import { resolveThreeColor } from './resolveColor'
import type { Canvas3dModeId } from '@/lib/config'
import { extractVoxelScores, resolveVoxelClusterColor, resolveVoxelClusterKey, resolveVoxelLayerMaxVoxelHeight, VOXEL_SCORE_DIMENSIONS } from './voxelStyle'
import { resolveVoxelGridStep } from './threeLayoutConfig'
import { getNodeLabelFullText2d } from '@/components/GraphCanvas/labelLayout2d'
import { resolveCssVar } from '@/lib/ui/theme-tokens'
import { getVoxelLabelTexture } from './voxelLabelTexture'
import { truncateTextWithEllipsis } from '@/components/GraphCanvas/layout/utils'
import { isRichMediaPanelDisplayEnabled } from '@/lib/render/richMediaSsot'
import {
  canStartThreeObjectDrag,
  captureThreeObjectPointer,
  claimThreeObjectInputOwnership,
  hasThreeObjectDragMoved,
  isolateThreeObjectPointerEvent,
  releaseThreeObjectPointerCapture,
  releaseThreeObjectInputOwnership,
  threeObjectDragTerminationMatchesPointer,
} from './threeObjectInputOwnership'

export function NodeMesh({
  node,
  pos,
  schema,
  renderOrder,
  paused,
  onClick,
  selection,
  visuals,
  onDragStart,
  onDrag,
  onDragEnd,
  onHoverChange,
  setNodeDragActive,
  motionIntensity,
  draggedNodeId,
  dragOverridesRef,
  mode = '3d',
}: {
  node: GraphNode;
  pos: Vec3;
  schema: GraphSchema;
  renderOrder?: number;
  paused?: boolean;
  onClick: (id: string) => void;
  selection: NodeSelectionState;
  visuals: SelectionVisuals;
  onDragStart?: (id: string, e: ThreeEvent<PointerEvent>) => void;
  onDrag?: (id: string, e: ThreeEvent<PointerEvent>) => void;
  onDragEnd?: (id: string, e: ThreeEvent<PointerEvent>) => void;
  onHoverChange?: (info: { id: string; clientX: number; clientY: number } | null) => void;
  setNodeDragActive?: (id: string, active: boolean) => void;
  motionIntensity?: number;
  draggedNodeId?: string | null;
  dragOverridesRef?: React.MutableRefObject<Record<string, Vec3>>;
  mode?: Canvas3dModeId;
}) {
  const [hovered, setHovered] = useState(false)
  const groupRef = useRef<THREE.Group>(null!)
  const hitRef = useRef<THREE.Mesh>(null!)
  const gapRingRef = useRef<THREE.Mesh>(null)
  const gapRingMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const draggingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const dragStartClientRef = useRef<{ x: number; y: number } | null>(null)
  const dragMovedRef = useRef(false)
  const dragCursorTargetRef = useRef<HTMLElement | null>(null)
  const windowFinishRef = useRef<EventListener | null>(null)
  const mediaNodeOpacity = useGraphStore(s => s.mediaNodeOpacity)
  const renderMediaAsNodes = useGraphStore(s => s.renderMediaAsNodes)
  const baseColor = getNodeBaseFill(node, schema)
  const props = node.properties || {}
  const baseRadius = getRenderNodeRadius2d(node, schema)
  const baseLayerOpacity = (() => {
    const a = getLayerOpacity(node, schema)
    const b = getVisualOpacity(node)
    const v = a * b
    if (!Number.isFinite(v)) return 1
    if (v < 0) return 0
    if (v > 1) return 1
    return v
  })()
  const deg = typeof props['degree'] === 'number' ? (props['degree'] as number) : undefined
  const scale = deg ? Math.max(0.9, Math.min(1.6, 0.95 + Math.sqrt(Math.max(1, deg)) * 0.15)) : 1
  const radius = baseRadius * scale

  const mediaSpec = getNodeMediaSpec(node)
  const isMediaNode = isRichMediaPanelDisplayEnabled({
    renderMediaAsNodes,
    canvasRenderMode: '3d',
    canvas3dMode: mode,
  }) && !!mediaSpec
  const mediaLayerOpacity = Math.max(0, Math.min(1, mediaNodeOpacity * baseLayerOpacity))

  let displayColor = baseColor
  let displayOpacity = baseLayerOpacity
  const palette = getRendererPalette(schema)
  const dimmedColor = palette.edges.neutral || MVP_COLOR_PALETTE.edges.neutral
  if (selection.mode === 'edge') {
    if (selection.isEdgeEndpoint) {
      displayColor = baseColor
      displayOpacity = isMediaNode ? mediaLayerOpacity : baseLayerOpacity
    } else {
      displayColor = dimmedColor
      displayOpacity = isMediaNode ? mediaLayerOpacity : baseLayerOpacity * visuals.dimmedNodeOpacity
    }
  } else if (selection.mode === 'node') {
    if (selection.isSelected) {
      displayColor = visuals.selectedEdgeColor
      displayOpacity = isMediaNode ? mediaLayerOpacity : baseLayerOpacity
    } else if (selection.isNeighbor) {
      displayColor = baseColor
      displayOpacity = isMediaNode ? mediaLayerOpacity : baseLayerOpacity
    } else {
      displayColor = dimmedColor
      displayOpacity = isMediaNode ? mediaLayerOpacity : baseLayerOpacity * visuals.dimmedNodeOpacity
    }
  }
  if (isMediaNode && selection.mode === 'none' && !selection.isSelected) {
    displayColor = dimmedColor
  }
  const isSelectedNode = selection.isSelected
  const emissiveColor = isSelectedNode ? visuals.selectedEdgeColor : '#000000'
  const emissiveIntensity = isSelectedNode ? visuals.selectedNodeGlowIntensity : 0
  const resolvedEmissive = resolveThreeColor(emissiveColor, '#000000')
  const renderShape = getNodeRenderShape2d(node, schema)
  const rectDims = renderShape === 'circle' ? null : getNodeRectDimensions2d(node, schema)
  const depth = Math.max(2, radius * 0.85)
  const boxW = rectDims ? Math.max(2, rectDims.width) : Math.max(2, radius * 2)
  const boxH = rectDims ? Math.max(2, rectDims.height) : Math.max(2, radius * 2)
  const hexR = Math.max(2, Math.min(boxW, boxH) / 2)
  const isVoxel = mode === 'voxel'
  const normalizedType = String(node.type || '').toLowerCase()
  const isHub = normalizedType.includes('hub')
  const isProblem = normalizedType.includes('problem')
  const isConcept = normalizedType.includes('concept')
  const clusterKey = resolveVoxelClusterKey(node)
  const isGrouped = clusterKey.length > 0
  const voxelTier = isHub ? 'hub' : (isGrouped || isProblem || isConcept ? 'block' : 'brick')
  const voxelGridStep = resolveVoxelGridStep(schema)
  const voxelSize = Math.max(2, voxelGridStep)
  const voxelW = voxelSize
  const voxelH = voxelSize
  const voxelD = voxelSize
  const capHeight = Math.max(0.8, voxelH * 0.12)
  const threeCfg = getThreeConfig(schema)
  const clusterColor = resolveVoxelClusterColor(node)
  const voxelColor = isVoxel && clusterColor ? clusterColor : displayColor
  const resolvedColor = resolveThreeColor(voxelColor, MVP_COLOR_PALETTE.nodes.execution)
  const voxelScores = React.useMemo(() => (isVoxel ? extractVoxelScores(node) : null), [isVoxel, node])
  const voxelScoresMaxHeightFactor = React.useMemo(() => {
    if (!isVoxel || !voxelScores) return null
    return resolveVoxelLayerMaxVoxelHeight(node)
  }, [isVoxel, node, voxelScores])
  const voxelScoresMaxH = voxelScores ? (voxelSize * (voxelScoresMaxHeightFactor ?? 1.4)) : 0
  const voxelScoresMinH = voxelScores ? Math.max(0.6, voxelSize * 0.12) : 0
  const voxelScoresBox = React.useMemo(() => {
    if (!isVoxel || !voxelScores) return null
    const maxScore = Math.max(voxelScores.money, voxelScores.man, voxelScores.machine)
    const height = Math.max(voxelScoresMinH, voxelScoresMaxH * maxScore)
    const barW = Math.max(1, voxelSize * 0.46)
    const barD = Math.max(1, voxelSize * 0.46)
    const barOffset = Math.max(barW * 1.35, voxelSize * 0.64)
    const hitW = barOffset * 2 + barW
    const hitD = Math.max(barD, voxelSize * 0.8)
    return { maxH: height, barW, barD, barOffset, hitW, hitD }
  }, [isVoxel, voxelScores, voxelScoresMaxH, voxelScoresMinH, voxelSize])
  const gapScore = (() => {
    const propsAny = (node.properties || {}) as Record<string, unknown>
    const v = propsAny.gapScore
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    return Math.max(0, Math.min(1, v))
  })()
  const gapRingThreshold = (() => {
    const raw = schema?.three?.voxelGapRingThreshold
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0.85
    return Math.max(0, Math.min(1, raw))
  })()
  const showGapRing = isVoxel && gapScore != null && gapScore >= gapRingThreshold
  const ghostOpacity = (() => {
    const raw = typeof threeCfg.voxelGhostOpacity === 'number' ? threeCfg.voxelGhostOpacity : 0.32
    if (!Number.isFinite(raw)) return 0.32
    return Math.max(0.05, Math.min(0.9, raw))
  })()
  const topCapEmissiveIntensity = (() => {
    const raw = typeof threeCfg.voxelTopCapEmissiveIntensity === 'number' ? threeCfg.voxelTopCapEmissiveIntensity : 0.9
    if (!Number.isFinite(raw)) return 0.9
    return Math.max(0.2, Math.min(2.2, raw))
  })()
  const hubPulseStrength = (() => {
    const raw = typeof threeCfg.voxelHubPulseStrength === 'number' ? threeCfg.voxelHubPulseStrength : 0.07
    if (!Number.isFinite(raw)) return 0.07
    return Math.max(0, Math.min(0.5, raw))
  })()
  const voxelAnimationEnabled = schema?.three?.voxelAnimationEnabled !== false
  const voxelEmissiveBase = voxelTier === 'hub' ? 0.55 : voxelTier === 'block' ? 0.32 : 0.2
  const meshRotation: [number, number, number] =
    isVoxel
      ? [0, 0, 0]
      : renderShape === 'hex'
      ? [Math.PI / 2, 0, 0]
      : renderShape === 'diamond'
        ? [0, 0, Math.PI / 4]
        : [0, 0, 0]
  useFrame(({ clock }) => {
    if (paused) return
    if (!groupRef.current) return
    const t = clock.getElapsedTime()
    const dragging = draggingRef.current
    const ms: NodeMotionState = { intensity: motionIntensity || 0, draggedNodeId }
    if (dragging && !draggedNodeId) {
      ms.draggedNodeId = node.id
    }
    const basePos = dragOverridesRef?.current?.[node.id] || pos
    const p = computeNodeMotion(node.id, basePos, radius, ms, t)
    
    const s = hovered ? 1.06 : 1
    const pulse = isVoxel && isHub && voxelAnimationEnabled ? 1 + Math.sin(t * 2 + node.id.length * 0.6) * hubPulseStrength : 1
    groupRef.current.scale.set(s * pulse, s * pulse, s * pulse)
    const conceptBob = 0
    groupRef.current.position.set(p[0], p[1], p[2] + conceptBob)
    if (labelSpriteRef.current && isVoxel) {
      const liftH = voxelScoresBox ? voxelScoresBox.maxH : voxelH
      labelSpriteRef.current.position.set(0, 0, liftH + voxelLabelLift)
      if (labelMaterial) {
        const aspect = labelMaterial.heightPx > 0 ? (labelMaterial.widthPx / labelMaterial.heightPx) : 1
        const targetH = Math.max(2, voxelGridStep * 0.34)
        const targetW = Math.max(targetH, targetH * aspect)
        const key = `${targetW.toFixed(2)}x${targetH.toFixed(2)}`
        if (labelScaleKeyRef.current !== key) {
          labelScaleKeyRef.current = key
          labelSpriteRef.current.scale.set(targetW, targetH, 1)
        }
      }
    }
    if (gapRingRef.current && gapRingMatRef.current && isVoxel && showGapRing && voxelAnimationEnabled) {
      const phase = t * 2.4 + (node.id.length % 7) * 0.6
      const pulse = 1 + Math.sin(phase) * 0.08
      gapRingRef.current.scale.set(pulse, pulse, 1)
      gapRingMatRef.current.opacity = Math.max(0, Math.min(1, 0.28 + 0.38 * Math.sin(phase * 1.1)))
    } else if (gapRingRef.current && gapRingMatRef.current && isVoxel && showGapRing) {
      gapRingRef.current.scale.set(1, 1, 1)
      gapRingMatRef.current.opacity = 0.52
    }
  })

  const voxelLabelsEnabled = (() => {
    const raw = (schema?.three as any)?.voxelLabelsEnabled
    return raw !== false
  })()
  const voxelLabelOpacity = (() => {
    const raw = typeof (schema?.three as any)?.voxelLabelOpacity === 'number' ? (schema?.three as any).voxelLabelOpacity : 0.9
    return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.9
  })()
  const voxelLabelFontSizePx = (() => {
    const raw = typeof (schema?.three as any)?.voxelLabelFontSizePx === 'number' ? (schema?.three as any).voxelLabelFontSizePx : 12
    return Number.isFinite(raw) ? Math.max(8, Math.min(36, Math.floor(raw))) : 12
  })()
  const voxelLabelMaxChars = (() => {
    const raw = typeof (schema?.three as any)?.voxelLabelMaxChars === 'number' ? (schema?.three as any).voxelLabelMaxChars : 42
    return Number.isFinite(raw) ? Math.max(8, Math.min(120, Math.floor(raw))) : 42
  })()
  const voxelLabelShowOnHoverOnly = (() => {
    const raw = (schema?.three as any)?.voxelLabelShowOnHoverOnly
    return raw === true
  })()
  const voxelLabelLift = (() => {
    const raw = typeof (schema?.three as any)?.voxelLabelLift === 'number' ? (schema?.three as any).voxelLabelLift : 4
    return Number.isFinite(raw) ? Math.max(0, Math.min(voxelH * 2, raw)) : 4
  })()
  const labelText = React.useMemo(() => {
    if (!isVoxel) return ''
    const raw = getNodeLabelFullText2d(node)
    const clean = typeof raw === 'string' ? raw.trim() : ''
    if (!clean) return ''
    return truncateTextWithEllipsis(clean, voxelLabelMaxChars)
  }, [isVoxel, node, voxelLabelMaxChars])
  const shouldShowVoxelLabel = isVoxel && voxelLabelsEnabled && !!labelText && (!voxelLabelShowOnHoverOnly || hovered)
  const labelSpriteRef = React.useRef<THREE.Sprite | null>(null)
  const labelScaleKeyRef = React.useRef<string>('')
  const labelMaterial = React.useMemo(() => {
    if (!shouldShowVoxelLabel) return null
    if (typeof document === 'undefined') return null
    const textColor = resolveCssVar('--kg-canvas-label-fill', '#111827')
    const bgColor = resolveCssVar('--kg-tooltip-bg', '#111827')
    const { texture, widthPx, heightPx } = getVoxelLabelTexture({
      text: labelText,
      fontSizePx: voxelLabelFontSizePx,
      textColor,
      bgColor,
      bgOpacity: 0.42,
    })
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
    mat.depthTest = false
    mat.opacity = voxelLabelOpacity
    return { mat, widthPx, heightPx }
  }, [labelText, shouldShowVoxelLabel, voxelLabelFontSizePx, voxelLabelOpacity])
  React.useEffect(() => {
    labelScaleKeyRef.current = ''
  }, [labelMaterial, voxelGridStep])
  React.useEffect(() => {
    return () => {
      if (labelMaterial?.mat) {
        labelMaterial.mat.dispose()
      }
    }
  }, [labelMaterial])
  const clearDrag = React.useCallback(() => {
    const windowFinish = windowFinishRef.current
    if (windowFinish && typeof window !== 'undefined') {
      window.removeEventListener('pointerup', windowFinish)
      window.removeEventListener('pointercancel', windowFinish)
      window.removeEventListener('lostpointercapture', windowFinish, true)
      window.removeEventListener('blur', windowFinish)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', windowFinish)
    }
    windowFinishRef.current = null
    const pointerId = activePointerIdRef.current
    activePointerIdRef.current = null
    dragStartClientRef.current = null
    dragMovedRef.current = false
    const cursorTarget = dragCursorTargetRef.current
    dragCursorTargetRef.current = null
    if (cursorTarget?.style) cursorTarget.style.cursor = 'default'
    if (!draggingRef.current) return
    draggingRef.current = false
    if (dragOverridesRef) delete dragOverridesRef.current[node.id]
    releaseThreeObjectInputOwnership(node.id, pointerId ?? undefined)
    setNodeDragActive?.(node.id, false)
  }, [dragOverridesRef, node.id, setNodeDragActive])
  const finishDrag = React.useCallback((e?: ThreeEvent<PointerEvent>) => {
    const wasDragging = draggingRef.current
    const dragMoved = dragMovedRef.current
    clearDrag()
    if (!wasDragging || !e) return
    isolateThreeObjectPointerEvent(e)
    if (dragMoved) onDragEnd?.(node.id, e)
    releaseThreeObjectPointerCapture(e)
  }, [clearDrag, node.id, onDragEnd])
  React.useEffect(() => clearDrag, [clearDrag])
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!canStartThreeObjectDrag(e.button) || draggingRef.current) return
    if (!claimThreeObjectInputOwnership(node.id, e.pointerId)) return
    isolateThreeObjectPointerEvent(e)
    draggingRef.current = true
    activePointerIdRef.current = e.pointerId
    dragStartClientRef.current = { x: e.clientX, y: e.clientY }
    dragMovedRef.current = false
    dragCursorTargetRef.current = e.nativeEvent.target as HTMLElement | null
    setNodeDragActive?.(node.id, true)
    const finishWindowDrag: EventListener = nativeEvent => {
      if (nativeEvent.type === 'visibilitychange'
        && typeof document !== 'undefined'
        && document.visibilityState !== 'hidden') return
      if (!threeObjectDragTerminationMatchesPointer(nativeEvent as PointerEvent, activePointerIdRef.current)) return
      clearDrag()
    }
    windowFinishRef.current = finishWindowDrag
    window.addEventListener('pointerup', finishWindowDrag)
    window.addEventListener('pointercancel', finishWindowDrag)
    window.addEventListener('lostpointercapture', finishWindowDrag, true)
    window.addEventListener('blur', finishWindowDrag)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', finishWindowDrag)
    if (dragCursorTargetRef.current?.style) dragCursorTargetRef.current.style.cursor = 'grabbing'
    captureThreeObjectPointer(e)
    onDragStart?.(node.id, e)
  }
  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (onHoverChange) {
      onHoverChange({ id: node.id, clientX: e.clientX, clientY: e.clientY })
    }
    if (!draggingRef.current || e.pointerId !== activePointerIdRef.current) return
    isolateThreeObjectPointerEvent(e)
    const dragStart = dragStartClientRef.current
    if (!dragMovedRef.current && dragStart) {
      dragMovedRef.current = hasThreeObjectDragMoved(dragStart, { x: e.clientX, y: e.clientY })
    }
    if (!dragMovedRef.current) return
    onDrag?.(node.id, e)
  }
  const handlePointerOut = () => {
    setHovered(false)
  }
  const voxelHitH = voxelScoresBox ? voxelScoresBox.maxH : voxelH
  const voxelHitW = voxelScoresBox ? voxelScoresBox.hitW : voxelW
  const voxelHitD = voxelScoresBox ? voxelScoresBox.hitD : voxelD
  return (
    <group ref={groupRef} name={`agentic_os_node:${node.id}`} renderOrder={renderOrder}>
      <mesh
        ref={hitRef}
        name={`agentic_os_node_hit:${node.id}`}
        renderOrder={renderOrder}
        position={isVoxel ? [0, 0, voxelHitH * 0.5] : [0, 0, 0]}
        rotation={isVoxel ? [0, 0, 0] : meshRotation}
        onClick={() => onClick(node.id)}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          setHovered(true)
          if (onHoverChange) {
            onHoverChange({ id: node.id, clientX: e.clientX, clientY: e.clientY })
          }
        }}
        onPointerOut={() => {
          handlePointerOut()
          if (onHoverChange) {
            onHoverChange(null)
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        {isVoxel ? (
          <boxGeometry args={[voxelHitW, voxelHitD, voxelHitH]} />
        ) : renderShape === 'circle' ? (
          <sphereGeometry args={[radius, 32, 32]} />
        ) : renderShape === 'hex' ? (
          <cylinderGeometry args={[hexR, hexR, depth, 6]} />
        ) : (
          <boxGeometry args={[boxW, boxH, depth]} />
        )}
        {isVoxel ? (
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        ) : (
          <meshStandardMaterial
            color={resolvedColor}
            transparent
            opacity={isMediaNode ? 0 : displayOpacity}
            depthWrite={!isMediaNode}
            emissive={resolvedEmissive}
            emissiveIntensity={emissiveIntensity}
            roughness={0.6}
            metalness={0.1}
          />
        )}
      </mesh>
      {isVoxel && voxelScoresBox && voxelScores ? (
        <group name={`agentic_os_node_voxel_scores:${node.id}`} renderOrder={renderOrder}>
          {VOXEL_SCORE_DIMENSIONS.map((dim, i) => {
            const score = voxelScores[dim.key]
            const h = Math.max(voxelScoresMinH, voxelScoresMaxH * score)
            const x = (i - 1) * voxelScoresBox.barOffset
            const y = 0
            const z = h * 0.5
            const emissive = hovered ? dim.color : '#000000'
            const emissiveIntensity = hovered ? 0.55 : 0
            return (
              <mesh key={dim.key} position={[x, y, z]}>
                <boxGeometry args={[voxelScoresBox.barW, voxelScoresBox.barD, h]} />
                <meshStandardMaterial
                  color={dim.color}
                  emissive={emissive}
                  emissiveIntensity={emissiveIntensity}
                  transparent
                  opacity={Math.max(0.1, Math.min(1, displayOpacity))}
                  roughness={0.38}
                  metalness={0.12}
                  depthWrite={true}
                />
              </mesh>
            )
          })}
        </group>
      ) : null}
      {isVoxel && (!voxelScoresBox || !voxelScores) ? (
        <group name={`agentic_os_node_voxel_cube:${node.id}`} renderOrder={renderOrder}>
          <mesh position={[0, 0, voxelH * 0.5]}>
            <boxGeometry args={[voxelW, voxelD, voxelH]} />
            <meshStandardMaterial
              color={resolvedColor}
              transparent
              opacity={isMediaNode ? 0 : displayOpacity}
              depthWrite={!isMediaNode}
              emissive={resolvedEmissive}
              emissiveIntensity={Math.max(emissiveIntensity, voxelEmissiveBase)}
              roughness={0.22}
              metalness={0.7}
            />
          </mesh>
          <mesh position={[0, 0, voxelH + capHeight * 0.5]}>
            <boxGeometry args={[voxelW * 0.98, voxelD * 0.98, capHeight]} />
            <meshStandardMaterial color={resolvedColor} emissive={resolvedColor} emissiveIntensity={topCapEmissiveIntensity} transparent opacity={0.88} roughness={0.08} metalness={0.95} />
          </mesh>
          <mesh position={[0, 0, voxelH * 0.5]}>
            <octahedronGeometry args={[Math.max(1.2, Math.min(voxelW, voxelH) * 0.2), 0]} />
            <meshStandardMaterial color={resolvedColor} emissive={resolvedColor} emissiveIntensity={0.6} transparent opacity={0.92} roughness={0.1} metalness={0.95} />
          </mesh>
        </group>
      ) : null}
      {isVoxel && showGapRing ? (
        <mesh ref={gapRingRef} position={[0, 0, 0.05]} renderOrder={renderOrder}>
          <ringGeometry args={[Math.max(1, (voxelScoresBox ? voxelScoresBox.hitW * 0.46 : voxelW * 0.72)), Math.max(1.2, (voxelScoresBox ? voxelScoresBox.hitW * 0.52 : voxelW * 0.8)), 72]} />
          <meshBasicMaterial ref={gapRingMatRef} color={'#E24B4A'} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ) : null}
      {isVoxel && hovered ? (
        <group name={`agentic_os_node_voxel_hover:${node.id}`} renderOrder={renderOrder}>
          <mesh position={[0, 0, voxelHitH * 0.5]}>
            <boxGeometry args={[voxelHitW * 1.15, voxelHitD * 1.15, voxelHitH * 1.15]} />
            <meshStandardMaterial color={resolvedColor} emissive={resolvedColor} emissiveIntensity={0.38} transparent opacity={ghostOpacity} depthWrite={false} roughness={0.3} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0, voxelHitH * 0.5]}>
            <boxGeometry args={[voxelHitW * 1.16, voxelHitD * 1.16, voxelHitH * 1.16]} />
            <meshBasicMaterial color={resolvedColor} wireframe transparent opacity={Math.min(0.95, ghostOpacity + 0.22)} />
          </mesh>
        </group>
      ) : null}
      {isVoxel && isSelectedNode ? (
        <mesh position={[0, 0, voxelHitH * 0.5]} renderOrder={renderOrder}>
          <boxGeometry args={[voxelHitW * 1.22, voxelHitD * 1.22, voxelHitH * 1.22]} />
          <meshBasicMaterial color={resolvedColor} wireframe transparent opacity={0.75} />
        </mesh>
      ) : null}
      {shouldShowVoxelLabel && labelMaterial ? (
        <sprite
          ref={labelSpriteRef as any}
          renderOrder={typeof renderOrder === 'number' && Number.isFinite(renderOrder) ? renderOrder + 1 : undefined}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
          }}
        >
          <primitive attach="material" object={labelMaterial.mat} />
        </sprite>
      ) : null}
    </group>
  )
}
