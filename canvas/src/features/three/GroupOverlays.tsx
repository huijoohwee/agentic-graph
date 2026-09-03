import React from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getRenderNodeRadius2d } from '@/components/GraphCanvas/helpers'
import { readAllowGroupResize } from '@/lib/canvas/groupResizePolicy'
import { readGroupResizeHandleConfig } from '@/lib/canvas/groupResizeHandleConfig'
import { commitGroupBoundsOverrideToStore } from '@/lib/canvas/groupBoundsOverridesStore'
import { buildGroupRectByIdFromSchemaOverrides } from '@/lib/canvas/groupExplicitBounds'
import { filterGroupsByCollapsedAncestors } from '@/lib/graph/groupVisibility'
import { intersectRayWithZPlane } from './raycast'

type Vec3 = [number, number, number]

const buildRectLinePoints = (x: number, y: number, w: number, h: number): Float32Array => {
  const x0 = x
  const y0 = y
  const x1 = x + w
  const y1 = y + h
  return new Float32Array([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0, x0, y0, 0])
}

const readGroupPadding = (schema: GraphSchema): number => {
  const cfg = schema.layout?.groups as unknown as { padding?: unknown } | null
  return typeof cfg?.padding === 'number' && Number.isFinite(cfg.padding) ? Math.max(0, cfg.padding) : 24
}

const computeAutoBounds = (args: {
  group: GraphGroup
  schema: GraphSchema
  nodeById: Map<string, GraphNode>
  positions: Record<string, Vec3>
  dragOverridesRef: React.MutableRefObject<Record<string, Vec3>> | null
}): { x: number; y: number; w: number; h: number } | null => {
  const members = Array.isArray(args.group.memberNodeIds) ? args.group.memberNodeIds : []
  const padding = readGroupPadding(args.schema)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let valid = 0
  for (let i = 0; i < members.length; i += 1) {
    const id = String(members[i] || '').trim()
    if (!id) continue
    const n = args.nodeById.get(id) || null
    if (!n) continue
    const p = (args.dragOverridesRef?.current?.[id] || args.positions[id]) as Vec3 | undefined
    if (!p) continue
    const r = getRenderNodeRadius2d(n, args.schema)
    const x0 = p[0] - r
    const x1 = p[0] + r
    const y0 = p[1] - r
    const y1 = p[1] + r
    if (!Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(y0) || !Number.isFinite(y1)) continue
    if (x0 < minX) minX = x0
    if (y0 < minY) minY = y0
    if (x1 > maxX) maxX = x1
    if (y1 > maxY) maxY = y1
    valid += 1
  }
  if (!valid || minX === Infinity) return null
  const x = minX - padding
  const y = minY - padding
  const w = Math.max(1, maxX - minX + padding * 2)
  const h = Math.max(1, maxY - minY + padding * 2)
  return { x, y, w, h }
}

const computeWorldRadiusForPx = (args: { camera: THREE.Camera; viewportW: number; viewportH: number; position: THREE.Vector3; px: number }): number => {
  const p0 = args.position.clone()
  const p1 = args.position.clone().add(new THREE.Vector3(1, 0, 0))
  const ndc0 = p0.project(args.camera)
  const ndc1 = p1.project(args.camera)
  const sx0 = (ndc0.x * 0.5 + 0.5) * args.viewportW
  const sx1 = (ndc1.x * 0.5 + 0.5) * args.viewportW
  const pxPerWorld = Math.abs(sx1 - sx0)
  if (!Number.isFinite(pxPerWorld) || pxPerWorld < 1e-6) return Math.max(0.001, args.px * 0.01)
  return Math.max(0.001, args.px / pxPerWorld)
}

export function GroupOverlays3d(args: {
  data: GraphData
  schema: GraphSchema
  positions: Record<string, Vec3>
  dragOverridesRef: React.MutableRefObject<Record<string, Vec3>> | null
  renderOrder?: number
}) {
  const selectedGroupId = useGraphStore(s => s.selectedGroupId)
  const selectGroup = useGraphStore(s => s.selectGroup)
  const setSelectionSource = useGraphStore(s => s.setSelectionSource)
  const allowResize = readAllowGroupResize(args.schema)
  const cfg = readGroupResizeHandleConfig(args.schema)
  const { camera, size } = useThree()

  const nodeById = React.useMemo(() => {
    const m = new Map<string, GraphNode>()
    for (let i = 0; i < args.data.nodes.length; i += 1) {
      const n = args.data.nodes[i]
      const id = String(n?.id || '').trim()
      if (id && !m.has(id)) m.set(id, n)
    }
    return m
  }, [args.data.nodes])

  const groups = React.useMemo(() => {
    const meta = args.data.metadata && typeof args.data.metadata === 'object' && !Array.isArray(args.data.metadata) ? (args.data.metadata as Record<string, unknown>) : null
    const view = meta && meta['kg:view'] && typeof meta['kg:view'] === 'object' && !Array.isArray(meta['kg:view']) ? (meta['kg:view'] as Record<string, unknown>) : null
    const ids = view && Array.isArray(view.collapsedGroupIds) ? (view.collapsedGroupIds as unknown[]) : []
    const collapsedSet = new Set<string>(ids.map(x => String(x || '').trim()).filter(Boolean))
    return filterGroupsByCollapsedAncestors({ groups: deriveGraphGroups(args.data), collapsedGroupIdSet: collapsedSet })
  }, [args.data])
  const explicitById = React.useMemo(() => buildGroupRectByIdFromSchemaOverrides({ groups: groups as GraphGroup[], graphNodes: args.data.nodes as GraphNode[], schema: args.schema }), [args.data.nodes, args.schema, groups])

  const dragStateRef = React.useRef<null | { groupId: string; start: { x: number; y: number; w: number; h: number }; startWorld: { x: number; y: number }; minW: number; minH: number }>(null)
  const transientBoundsRef = React.useRef<Map<string, { x: number; y: number; w: number; h: number }>>(new Map())

  React.useEffect(() => {
    const commitAndClearActiveResize = () => {
      const st = dragStateRef.current
      if (!st) return
      const id = String(st.groupId || '').trim()
      const b = id ? transientBoundsRef.current.get(id) || null : null
      dragStateRef.current = null
      if (id) transientBoundsRef.current.delete(id)
      if (!id || !b) return
      commitGroupBoundsOverrideToStore(id, { x: b.x, y: b.y, width: b.w, height: b.h })
    }
    const onAnyEnd = () => {
      commitAndClearActiveResize()
    }
    const onVisibility = () => {
      try {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') onAnyEnd()
      } catch {
        void 0
      }
    }
    window.addEventListener('pointerup', onAnyEnd, { capture: true })
    window.addEventListener('pointercancel', onAnyEnd, { capture: true })
    window.addEventListener('pointerdown', onAnyEnd, { capture: true })
    window.addEventListener('blur', onAnyEnd)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
    const watchdog = window.setInterval(() => {
      onAnyEnd()
    }, 12000) as unknown as number
    return () => {
      window.removeEventListener('pointerup', onAnyEnd, { capture: true } as AddEventListenerOptions)
      window.removeEventListener('pointercancel', onAnyEnd, { capture: true } as AddEventListenerOptions)
      window.removeEventListener('pointerdown', onAnyEnd, { capture: true } as AddEventListenerOptions)
      window.removeEventListener('blur', onAnyEnd)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      try {
        window.clearInterval(watchdog)
      } catch {
        void 0
      }
      commitAndClearActiveResize()
    }
  }, [])

  const items = React.useMemo(() => {
    return groups
      .map(g => {
        const id = String(g.id || '').trim()
        if (!id) return null
        return { id, group: g as GraphGroup }
      })
      .filter(Boolean) as Array<{ id: string; group: GraphGroup }>
  }, [groups])

  return (
    <>
      {items.map(item => {
        const selected = String(selectedGroupId || '').trim() === item.id
        const shouldShowHandle = allowResize && selected
        return (
          <GroupOverlayItem
            key={item.id}
            id={item.id}
            group={item.group}
            schema={args.schema}
            positions={args.positions}
            dragOverridesRef={args.dragOverridesRef}
            nodeById={nodeById}
            explicitById={explicitById}
            handleCfg={cfg}
            camera={camera}
            viewportW={size.width}
            viewportH={size.height}
            showHandle={shouldShowHandle}
            renderOrder={args.renderOrder}
            onSelect={() => {
              setSelectionSource('canvas')
              selectGroup(item.id)
            }}
            dragStateRef={dragStateRef}
            transientBoundsRef={transientBoundsRef}
          />
        )
      })}
    </>
  )
}

function GroupOverlayItem(args: {
  id: string
  group: GraphGroup
  schema: GraphSchema
  positions: Record<string, Vec3>
  dragOverridesRef: React.MutableRefObject<Record<string, Vec3>> | null
  nodeById: Map<string, GraphNode>
  explicitById: Map<string, { x: number; y: number; width: number; height: number }>
  handleCfg: { dotRadiusPx: number; hitRadiusPx: number; strokeWidthPx: number; minBoundsSizePx: number }
  camera: THREE.Camera
  viewportW: number
  viewportH: number
  showHandle: boolean
  renderOrder?: number
  onSelect: () => void
  dragStateRef: React.MutableRefObject<null | { groupId: string; start: { x: number; y: number; w: number; h: number }; startWorld: { x: number; y: number }; minW: number; minH: number }>
  transientBoundsRef: React.MutableRefObject<Map<string, { x: number; y: number; w: number; h: number }>>
}) {
  const handleRef = React.useRef<THREE.Mesh | null>(null)
  const hitRef = React.useRef<THREE.Mesh | null>(null)
  const material = React.useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color('#94a3b8'), transparent: true, opacity: 0.75 }), [])
  const handleMaterial = React.useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#94a3b8'), transparent: true, opacity: 0.9 }), [])
  const hitMaterial = React.useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#000000'), transparent: true, opacity: 0 }), [])
  const geometry = React.useMemo(() => new THREE.BufferGeometry(), [])
  const lineObj = React.useMemo(() => new THREE.Line(geometry, material), [geometry, material])
  if (typeof args.renderOrder === 'number' && Number.isFinite(args.renderOrder)) {
    lineObj.renderOrder = args.renderOrder
  }
  const posArr = React.useMemo(() => new Float32Array(15), [])
  const posAttr = React.useMemo(() => new THREE.BufferAttribute(posArr, 3), [posArr])
  const sphereGeom = React.useMemo(() => new THREE.SphereGeometry(1, 16, 16), [])

  React.useEffect(() => {
    geometry.setAttribute('position', posAttr)
  }, [geometry, posAttr])

  useFrame(() => {
    const explicit = args.explicitById.get(args.id) || null
    const transient = args.transientBoundsRef.current.get(args.id) || null
    const base = (() => {
      if (transient) return transient
      if (explicit) return { x: explicit.x, y: explicit.y, w: explicit.width, h: explicit.height }
      return computeAutoBounds({ group: args.group, schema: args.schema, nodeById: args.nodeById, positions: args.positions, dragOverridesRef: args.dragOverridesRef })
    })()
    if (!base) return

    const x0 = base.x
    const y0 = base.y
    const x1 = base.x + base.w
    const y1 = base.y + base.h
    posArr[0] = x0
    posArr[1] = y0
    posArr[2] = 0
    posArr[3] = x1
    posArr[4] = y0
    posArr[5] = 0
    posArr[6] = x1
    posArr[7] = y1
    posArr[8] = 0
    posArr[9] = x0
    posArr[10] = y1
    posArr[11] = 0
    posArr[12] = x0
    posArr[13] = y0
    posArr[14] = 0
    posAttr.needsUpdate = true

    const handle = handleRef.current
    if (handle) {
      handle.position.set(base.x + base.w, base.y + base.h, 0)
      const rWorld = computeWorldRadiusForPx({ camera: args.camera, viewportW: args.viewportW, viewportH: args.viewportH, position: handle.position, px: args.handleCfg.dotRadiusPx })
      handle.scale.set(rWorld, rWorld, rWorld)
      handle.visible = args.showHandle
    }
    const hit = hitRef.current
    if (hit) {
      hit.position.set(base.x + base.w, base.y + base.h, 0)
      const rWorld = computeWorldRadiusForPx({ camera: args.camera, viewportW: args.viewportW, viewportH: args.viewportH, position: hit.position, px: args.handleCfg.hitRadiusPx })
      hit.scale.set(rWorld, rWorld, rWorld)
      hit.visible = args.showHandle
    }
  })

  const onHandlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!args.showHandle) return
    e.stopPropagation()
    args.onSelect()
    const world = intersectRayWithZPlane(e.ray, 0)
    if (!world) return
    const explicit = args.explicitById.get(args.id) || null
    const transient = args.transientBoundsRef.current.get(args.id) || null
    const base = (() => {
      if (transient) return transient
      if (explicit) return { x: explicit.x, y: explicit.y, w: explicit.width, h: explicit.height }
      return computeAutoBounds({ group: args.group, schema: args.schema, nodeById: args.nodeById, positions: args.positions, dragOverridesRef: args.dragOverridesRef })
    })()
    if (!base) return
    const auto = computeAutoBounds({ group: args.group, schema: args.schema, nodeById: args.nodeById, positions: args.positions, dragOverridesRef: args.dragOverridesRef })
    const minW = Math.max(args.handleCfg.minBoundsSizePx, auto ? auto.w : args.handleCfg.minBoundsSizePx)
    const minH = Math.max(args.handleCfg.minBoundsSizePx, auto ? auto.h : args.handleCfg.minBoundsSizePx)
    args.dragStateRef.current = { groupId: args.id, start: base, startWorld: { x: world.x, y: world.y }, minW, minH }
  }

  const onHandlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const st = args.dragStateRef.current
    if (!st || st.groupId !== args.id) return
    e.stopPropagation()
    const world = intersectRayWithZPlane(e.ray, 0)
    if (!world) return
    const dx = world.x - st.startWorld.x
    const dy = world.y - st.startWorld.y
    const w = Math.max(st.minW, st.start.w + dx)
    const h = Math.max(st.minH, st.start.h + dy)
    args.transientBoundsRef.current.set(args.id, { x: st.start.x, y: st.start.y, w, h })
  }

  const onHandlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    const st = args.dragStateRef.current
    if (!st || st.groupId !== args.id) return
    e.stopPropagation()
    const b = args.transientBoundsRef.current.get(args.id) || null
    args.dragStateRef.current = null
    args.transientBoundsRef.current.delete(args.id)
    if (!b) return
    commitGroupBoundsOverrideToStore(args.id, { x: b.x, y: b.y, width: b.w, height: b.h })
  }

  return (
    <group name={`agentic_os_group:${args.id}`} renderOrder={args.renderOrder}>
      <group
        renderOrder={args.renderOrder}
        onClick={(e) => {
          e.stopPropagation()
          args.onSelect()
        }}
      >
        <primitive object={lineObj} />
      </group>
      <mesh
        ref={hitRef}
        visible={args.showHandle}
        renderOrder={args.renderOrder}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      >
        <primitive object={sphereGeom} attach="geometry" />
        <primitive object={hitMaterial} attach="material" />
      </mesh>
      <mesh ref={handleRef} visible={args.showHandle} renderOrder={args.renderOrder}>
        <primitive object={sphereGeom} attach="geometry" />
        <primitive object={handleMaterial} attach="material" />
      </mesh>
    </group>
  )
}
