import React from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import {
  XR_MOTION_REFERENCE_SELECTION_COLOR,
  resolveXrMotionReferenceStage,
  sampleXrMotionReferenceFacingY,
  sampleXrMotionReferenceMarks,
} from '@/features/three/xrMotionReferenceModel'
import {
  dropXrMotionReferenceCastMark,
  readXrMotionReferenceRuntime,
  selectXrMotionReferenceCameraMark,
  selectXrMotionReferenceCastMark,
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import {
  controlXrSharedAssetControls,
  inspectXrSharedAssetControls,
  readXrSharedAssetControlRevision,
  subscribeXrSharedAssetControlRuntime,
} from '@/features/three/xrSharedAssetControlRuntime'
import { selectBoundXrActor, selectBoundXrShotTarget } from '@/features/three/xrSelectedActorBinding'
import { THREE_RENDER_ORDER } from '@/features/three/renderOrder'
import type { GraphData } from '@/lib/graph/types'
import { XrSceneLibrarySubject } from '@/features/three/XrSceneLibrarySubject'
import { xrMotionReferenceWorldPosition } from '@/features/three/xrMotionReferenceCoordinates'
import { XrStagePresetGeometry } from '@/features/three/XrStagePresetGeometry'
import { getVoxelLabelTexture } from '@/features/three/voxelLabelTexture'
import { sampleXrAnimationPose } from '@/features/three/xrAnimationCatalog'
import { XrKeyboardChoreographyRuntime } from '@/features/three/XrKeyboardChoreographyRuntime'
import { readXrPhysicsRuntime, readXrPhysicsRuntimeFrame } from '@/features/three/xrPhysicsRuntime'
import { resolveXrSubjectMotion, xrPhysicsOwnsAuthoredSubject } from '@/features/three/xrSubjectMotionConstraints'
import { applyXrConstrainedCastMarkChoreography } from '@/features/three/xrConstrainedCastMarkRuntime'
import { resolveMotionControlSubjectPose, useMotionControlAnimationPose } from '@/features/three/useMotionControlAnimationPose'
import {
  canStartThreeObjectDrag,
  captureThreeObjectPointer,
  claimThreeObjectInputOwnership,
  hasThreeObjectDragMoved,
  isolateThreeObjectPointerEvent,
  releaseThreeObjectPointerCapture,
  releaseThreeObjectInputOwnership,
  threeObjectDragTerminationMatchesPointer,
} from '@/features/three/threeObjectInputOwnership'
type XrCastTrack = ReturnType<typeof readXrMotionReferenceRuntime>['plan']['cast'][number]
type XrCastMark = XrCastTrack['marks'][number]
function useRetainedWhilePaused<T>(value: T, paused: boolean): T {
  const retainedRef = React.useRef(value)
  React.useLayoutEffect(() => { if (!paused) retainedRef.current = value }, [paused, value])
  return paused ? retainedRef.current : value
}
function setStagePointerCursor(event: ThreeEvent<PointerEvent>, cursor: 'grab' | 'grabbing' | 'default') {
  const target = event.nativeEvent.target as HTMLElement | null
  if (target?.style) target.style.cursor = cursor
}
function xrPhysicsOwnsSubject(subjectId: string): boolean {
  return xrPhysicsOwnsAuthoredSubject(readXrPhysicsRuntime(), subjectId)
}
function rayInCoordinateRoot(
  ray: THREE.Ray,
  coordinateRootRef?: React.RefObject<THREE.Object3D | null>,
): THREE.Ray {
  const localRay = ray.clone()
  const coordinateRoot = coordinateRootRef?.current
  if (!coordinateRoot) return localRay
  coordinateRoot.updateWorldMatrix(true, false)
  return localRay.applyMatrix4(new THREE.Matrix4().copy(coordinateRoot.matrixWorld).invert())
}

function CastMarkControl({
  actorId, children, controlSurface = 'mark', mark, scale, groundY, coordinateRootRef, inputEnabled,
}: {
  actorId: string
  children: React.ReactNode
  controlSurface?: 'actor' | 'mark'
  mark: XrCastMark
  scale: number
  groundY: number
  coordinateRootRef?: React.RefObject<THREE.Object3D | null>
  inputEnabled: boolean
}) {
  const draggingRef = React.useRef(false)
  const activePointerIdRef = React.useRef<number | null>(null)
  const dragStartClientRef = React.useRef<{ x: number; y: number } | null>(null)
  const dragMovedRef = React.useRef(false)
  const dragOffsetRef = React.useRef(new THREE.Vector3())
  const dragCursorTargetRef = React.useRef<HTMLElement | null>(null)
  const windowFinishRef = React.useRef<EventListener | null>(null)
  const inputOwnerId = `xr:${controlSurface}:${actorId}:${mark.id}`
  const dragPlane = React.useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -(groundY + mark.position[1] * scale)),
    [groundY, mark.position, scale],
  )
  const clearDrag = React.useCallback(() => {
    const activePointerId = activePointerIdRef.current
    const windowFinish = windowFinishRef.current
    if (windowFinish && typeof window !== 'undefined') {
      window.removeEventListener('pointerup', windowFinish)
      window.removeEventListener('pointercancel', windowFinish)
      window.removeEventListener('lostpointercapture', windowFinish, true)
      window.removeEventListener('blur', windowFinish)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', windowFinish)
      }
    }
    windowFinishRef.current = null
    activePointerIdRef.current = null
    dragStartClientRef.current = null
    dragMovedRef.current = false
    dragOffsetRef.current.set(0, 0, 0)
    const cursorTarget = dragCursorTargetRef.current
    dragCursorTargetRef.current = null
    if (cursorTarget?.style) cursorTarget.style.cursor = 'default'
    if (!draggingRef.current) return
    draggingRef.current = false
    releaseThreeObjectInputOwnership(inputOwnerId, activePointerId ?? undefined)
  }, [inputOwnerId])
  const finishDrag = React.useCallback((event?: ThreeEvent<PointerEvent>) => {
    const wasDragging = draggingRef.current
    clearDrag()
    if (!wasDragging) return
    if (event) {
      isolateThreeObjectPointerEvent(event)
      setStagePointerCursor(event, 'grab')
      releaseThreeObjectPointerCapture(event)
    }
  }, [clearDrag])
  React.useEffect(() => {
    if (!inputEnabled) clearDrag()
    return clearDrag
  }, [clearDrag, inputEnabled])
  return (
    <group
      name={`agentic_os_xr_motion_cast_${controlSurface}_control_${actorId}_${mark.id}`}
      userData={{ actorId, markId: mark.id, kgXrAnimationControl: true, controlSurface, draggableAxes: 'xz', interactive: inputEnabled }}
      onPointerOver={inputEnabled ? event => {
        event.stopPropagation()
        if (xrPhysicsOwnsSubject(actorId)) {
          setStagePointerCursor(event, 'default')
          return
        }
        setStagePointerCursor(event, draggingRef.current ? 'grabbing' : 'grab')
      } : undefined}
      onPointerOut={inputEnabled ? event => {
        if (!draggingRef.current) setStagePointerCursor(event, 'default')
      } : undefined}
      onClick={inputEnabled ? event => {
        event.stopPropagation()
        selectBoundXrActor(actorId)
        selectXrMotionReferenceCastMark(actorId, mark.id)
      } : undefined}
      onPointerDown={inputEnabled ? event => {
        if (xrPhysicsOwnsSubject(actorId)) return
        if (!canStartThreeObjectDrag(event.button)) return
        event.stopPropagation()
        if (draggingRef.current) return
        const grabPoint = rayInCoordinateRoot(event.ray, coordinateRootRef).intersectPlane(dragPlane, new THREE.Vector3())
        if (!grabPoint) return
        if (!claimThreeObjectInputOwnership(inputOwnerId, event.pointerId)) return
        isolateThreeObjectPointerEvent(event)
        const markWorldPosition = xrMotionReferenceWorldPosition(mark.position, scale, groundY)
        dragOffsetRef.current.set(...markWorldPosition).sub(grabPoint)
        selectBoundXrActor(actorId)
        selectXrMotionReferenceCastMark(actorId, mark.id)
        draggingRef.current = true
        activePointerIdRef.current = event.pointerId
        dragStartClientRef.current = { x: event.clientX, y: event.clientY }
        dragMovedRef.current = false
        dragCursorTargetRef.current = event.nativeEvent.target as HTMLElement | null
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
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', finishWindowDrag)
        }
        setStagePointerCursor(event, 'grabbing')
        captureThreeObjectPointer(event)
      } : undefined}
      onPointerMove={inputEnabled ? event => {
        if (!draggingRef.current || event.pointerId !== activePointerIdRef.current) return
        isolateThreeObjectPointerEvent(event)
        const dragStart = dragStartClientRef.current
        if (!dragMovedRef.current && dragStart) {
          dragMovedRef.current = hasThreeObjectDragMoved(dragStart, { x: event.clientX, y: event.clientY })
        }
        if (!dragMovedRef.current) return
        const point = rayInCoordinateRoot(event.ray, coordinateRootRef).intersectPlane(dragPlane, new THREE.Vector3())
        if (!point) return
        point.add(dragOffsetRef.current)
        const runtime = readXrMotionReferenceRuntime()
        const physics = readXrPhysicsRuntime()
        const motion = resolveXrSubjectMotion({
          actorId,
          desiredPosition: [point.x / scale, mark.position[1], point.z / scale],
          markId: mark.id,
          physics,
          physicsFrame: physics.phase === 'stopped' ? undefined : readXrPhysicsRuntimeFrame(),
          plan: runtime.plan,
          position: mark.position,
          timeSeconds: mark.timeSeconds,
        })
        if (motion.status === 'physics-owned') return
        const nextPosition = motion.position
        if (Math.abs(nextPosition[0] - mark.position[0]) < 0.001
          && Math.abs(nextPosition[2] - mark.position[2]) < 0.001) return
        applyXrConstrainedCastMarkChoreography({ actorId, markId: mark.id, position: nextPosition })
      } : undefined}
      onPointerUp={inputEnabled ? finishDrag : undefined}
      onPointerCancel={inputEnabled ? finishDrag : undefined}
    >
      {children}
    </group>
  )
}

function GraphCastPropCue({ pose, scale }: { pose: ReturnType<typeof sampleXrAnimationPose>; scale: number }) {
  if (pose.propCue === 'none') return null
  if (pose.propCue === 'cup') {
    return <mesh position={[scale * 0.42, scale * 1.02, -scale * 0.3]}><cylinderGeometry args={[scale * 0.1, scale * 0.08, scale * 0.22, 12]} /><meshStandardMaterial color="#e2e8f0" roughness={0.55} /></mesh>
  }
  if (pose.propCue === 'cards') {
    return <group position={[scale * 0.42, scale * 0.98, -scale * 0.28]}>{[-1, 0, 1].map(index => <mesh key={index} position={[index * scale * 0.08, 0, Math.abs(index) * scale * 0.018]} rotation={[0, 0, index * 0.16]}><boxGeometry args={[scale * 0.14, scale * 0.025, scale * 0.2]} /><meshStandardMaterial color="#f8fafc" roughness={0.72} /></mesh>)}</group>
  }
  return <group position={[scale * 0.42, scale * 1.02, -scale * 0.3]}><mesh><boxGeometry args={[scale * 0.2, scale * 0.16, scale * 0.36]} /><meshStandardMaterial color="#22d3ee" roughness={0.5} /></mesh><mesh position={[0, 0, -scale * 0.28]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[scale * 0.035, scale * 0.035, scale * 0.4, 8]} /><meshStandardMaterial color="#0ea5e9" roughness={0.5} /></mesh></group>
}

function PathSegment({
  left,
  right,
  scale,
  groundY,
  color,
  thickness,
}: {
  left: readonly [number, number, number]
  right: readonly [number, number, number]
  scale: number
  groundY: number
  color: string
  thickness: number
}) {
  const start = xrMotionReferenceWorldPosition(left, scale, groundY)
  const end = xrMotionReferenceWorldPosition(right, scale, groundY)
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const dz = end[2] - start[2]
  const length = Math.hypot(dx, dy, dz)
  if (length < 0.001) return null
  const direction = new THREE.Vector3(dx, dy, dz).normalize()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction)
  return (
    <mesh
      position={[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]}
      quaternion={quaternion}
    >
      <boxGeometry args={[length, thickness, thickness]} />
      <meshBasicMaterial color={color} transparent opacity={0.66} depthWrite={false} />
    </mesh>
  )
}

function resolveCastControlMark(track: XrCastTrack, selectedMarkId: string, playheadSeconds: number): XrCastMark | null {
  return track.marks.find(mark => mark.id === selectedMarkId)
    || track.marks.reduce<XrCastMark | null>((closest, mark) => {
      if (!closest) return mark
      return Math.abs(mark.timeSeconds - playheadSeconds) < Math.abs(closest.timeSeconds - playheadSeconds) ? mark : closest
    }, null)
}

function CastTrack({
  track, playheadSeconds, scale, groundY, renderLiveActor, livePose, selectedActor, selectedMarkId, coordinateRootRef, inputEnabled,
}: {
  track: XrCastTrack
  playheadSeconds: number
  scale: number
  groundY: number
  renderLiveActor: boolean
  livePose?: ReturnType<typeof sampleXrAnimationPose> | null
  selectedActor: boolean
  selectedMarkId: string
  coordinateRootRef?: React.RefObject<THREE.Object3D | null>
  inputEnabled: boolean
}) {
  const sampled = sampleXrMotionReferenceMarks(track.marks, playheadSeconds)
  const sampledPosition = xrMotionReferenceWorldPosition(sampled, scale, groundY)
  const markerSize = Math.max(0.7, scale * 0.16)
  const facingY = sampleXrMotionReferenceFacingY(track.marks, playheadSeconds)
  const moving = Math.abs(facingY) > 0.001 || track.marks.length > 1
  const walkSwing = moving ? Math.sin(playheadSeconds * Math.PI * 4) * 0.42 : 0
  const pose = livePose || sampleXrAnimationPose(track.animation, playheadSeconds)
  const actorControlMark = resolveCastControlMark(track, selectedMarkId, playheadSeconds)
  const livePosition = [
    sampledPosition[0] + pose.rootOffsetMeters[0] * scale,
    sampledPosition[1] + pose.rootOffsetMeters[1] * scale,
    sampledPosition[2] + pose.rootOffsetMeters[2] * scale,
  ] as const
  const degrees = THREE.MathUtils.degToRad
  return (
    <group name={`agentic_os_xr_motion_cast_${track.actorId}`}>
      {track.marks.slice(1).map((mark, index) => (
        <PathSegment
          key={`${track.actorId}:path:${mark.id}`}
          left={track.marks[index]!.position}
          right={mark.position}
          scale={scale}
          groundY={groundY}
          color={track.color}
          thickness={Math.max(0.25, scale * 0.035)}
        />
      ))}
      {track.marks.map((mark, index) => {
        const position = xrMotionReferenceWorldPosition(mark.position, scale, groundY)
        const selected = mark.id === selectedMarkId
        return (
          <CastMarkControl
            key={mark.id}
            actorId={track.actorId}
            mark={mark}
            scale={scale}
            groundY={groundY}
            coordinateRootRef={coordinateRootRef}
            inputEnabled={inputEnabled}
          >
            <mesh
              name={`agentic_os_xr_motion_cast_mark_${track.actorId}_${index + 1}`}
              position={[position[0], position[1] + 0.35, position[2]]}
              rotation={[-Math.PI / 2, 0, 0]}
              userData={{ actorId: track.actorId, markId: mark.id, markNumber: index + 1, timeSeconds: mark.timeSeconds, selected }}
            >
              <ringGeometry args={[markerSize * 0.72, markerSize, 28]} />
              <meshBasicMaterial color={track.color} transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            {selected ? (
              <mesh
                name={`agentic_os_xr_motion_cast_mark_highlight_${track.actorId}_${index + 1}`}
                position={[position[0], position[1] + 0.39, position[2]]}
                rotation={[-Math.PI / 2, 0, 0]}
                renderOrder={THREE_RENDER_ORDER.overlays}
                userData={{ actorId: track.actorId, markId: mark.id, selected: true }}
              >
                <ringGeometry args={[markerSize * 1.08, markerSize * 1.48, 32]} />
                <meshBasicMaterial color={XR_MOTION_REFERENCE_SELECTION_COLOR} transparent opacity={0.98} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            ) : null}
            <MarkNumberSprite
              number={index + 1}
              color={track.color}
              position={[position[0], position[1] + markerSize * 1.9, position[2]]}
              selected={selected}
              size={markerSize}
            />
          </CastMarkControl>
        )
      })}
      {renderLiveActor && actorControlMark ? <CastMarkControl
        actorId={track.actorId}
        controlSurface="actor"
        mark={actorControlMark}
        scale={scale}
        groundY={groundY}
        coordinateRootRef={coordinateRootRef}
        inputEnabled={inputEnabled}
      ><group
        name={`agentic_os_xr_motion_cast_live_${track.actorId}`}
        position={livePosition}
        rotation={[degrees(pose.rootRotationDegrees[0]), facingY + degrees(pose.rootRotationDegrees[1]), degrees(pose.rootRotationDegrees[2])]}
        userData={{
          animationPresetId: track.animation?.presetId || '',
          animationKind: track.animation?.kind || '',
          eventCues: pose.eventCues,
          kgXrAnimationControl: true,
          kgXrSharedAssetTarget: track.actorId,
          kgXrSharedAssetSelected: selectedActor,
          kgXrTimelineHighlight: selectedActor ? 'shared-asset' : '',
        }}
      >
        {selectedActor ? (
          <mesh
            name={`agentic_os_xr_motion_cast_live_highlight_${track.actorId}`}
            position={[0, scale * 0.04, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={THREE_RENDER_ORDER.overlays}
            userData={{
              actorId: track.actorId,
              selected: true,
              kgXrSharedAssetTarget: track.actorId,
              kgXrSharedAssetSelected: true,
              kgXrTimelineHighlight: 'shared-asset',
            }}
          >
            <ringGeometry args={[scale * 0.54, scale * 0.88, 32]} />
            <meshBasicMaterial
              color={XR_MOTION_REFERENCE_SELECTION_COLOR}
              transparent
              opacity={0.98}
              depthTest={false}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ) : null}
        <mesh position={[0, scale * (0.92 - pose.crouch * 0.18), 0]}>
          <boxGeometry args={[scale * 0.54, scale * 1.25, scale * 0.36]} />
          <meshStandardMaterial color={track.color} roughness={0.92} metalness={0} />
        </mesh>
        <mesh position={[0, scale * (1.78 - pose.crouch * 0.28), 0]}>
          <sphereGeometry args={[scale * 0.3, 18, 12]} />
          <meshStandardMaterial color={track.color} roughness={0.86} metalness={0} />
        </mesh>
        <mesh position={[-scale * 0.16, scale * 0.3, 0]} rotation={[walkSwing + pose.crouch * 0.5, 0, 0]}>
          <boxGeometry args={[scale * 0.18, scale * 0.72, scale * 0.2]} />
          <meshStandardMaterial color={track.color} roughness={0.92} metalness={0} />
        </mesh>
        <mesh position={[scale * 0.16, scale * 0.3, 0]} rotation={[-walkSwing + pose.crouch * 0.5, 0, 0]}>
          <boxGeometry args={[scale * 0.18, scale * 0.72, scale * 0.2]} />
          <meshStandardMaterial color={track.color} roughness={0.92} metalness={0} />
        </mesh>
        <mesh position={[-scale * 0.4, scale * 1.18, 0]} rotation={[degrees(pose.leftArmPitchDegrees), 0, degrees(pose.leftArmRollDegrees)]}><boxGeometry args={[scale * 0.16, scale * 0.66, scale * 0.18]} /><meshStandardMaterial color={track.color} roughness={0.92} metalness={0} /></mesh>
        <mesh position={[scale * 0.4, scale * 1.18, 0]} rotation={[degrees(pose.rightArmPitchDegrees), 0, degrees(pose.rightArmRollDegrees)]}><boxGeometry args={[scale * 0.16, scale * 0.66, scale * 0.18]} /><meshStandardMaterial color={track.color} roughness={0.92} metalness={0} /></mesh>
        <GraphCastPropCue pose={pose} scale={scale} />
      </group></CastMarkControl> : null}
    </group>
  )
}

function MarkNumberSprite({
  number,
  color,
  position,
  selected,
  size,
}: {
  number: number
  color: string
  position: readonly [number, number, number]
  selected: boolean
  size: number
}) {
  const label = React.useMemo(() => {
    if (typeof document === 'undefined') return null
    return getVoxelLabelTexture({
      text: String(number),
      fontSizePx: 24,
      textColor: selected ? '#0f172a' : '#ffffff',
      bgColor: selected ? XR_MOTION_REFERENCE_SELECTION_COLOR : color,
      bgOpacity: selected ? 1 : 0.96,
    })
  }, [color, number, selected])
  if (!label) return null
  const aspect = label.widthPx / Math.max(1, label.heightPx)
  return (
    <sprite position={position} scale={[size * (selected ? 1.9 : 1.45) * aspect, size * (selected ? 1.9 : 1.45), 1]} renderOrder={THREE_RENDER_ORDER.overlays}>
      <spriteMaterial map={label.texture} transparent depthTest={false} depthWrite={false} />
    </sprite>
  )
}

export function XrMotionReferenceStage({
  graphData: _graphData,
  span,
  groundY,
  coordinateRootRef,
  paused = false,
}: {
  graphData: GraphData | null
  span: number
  groundY: number
  coordinateRootRef?: React.RefObject<THREE.Object3D | null>
  paused?: boolean
}) {
  const liveRuntime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const sharedAssetControlRevision = React.useSyncExternalStore(
    subscribeXrSharedAssetControlRuntime,
    readXrSharedAssetControlRevision,
    readXrSharedAssetControlRevision,
  )
  const runtime = useRetainedWhilePaused(liveRuntime, paused)
  const liveMotionControl = useMotionControlAnimationPose()
  const motionControl = useRetainedWhilePaused(liveMotionControl, paused)
  const sharedAssetControls = React.useMemo(
    () => inspectXrSharedAssetControls(),
    [runtime.revision, sharedAssetControlRevision],
  )
  const { boundingBoxEnabled, motionActorId, livePose } = motionControl
  const stage = resolveXrMotionReferenceStage(runtime.plan.stageId)
  const scale = span / Math.max(stage.sizeMeters[0], stage.sizeMeters[1], 1)
  const subjectIds = React.useMemo(() => new Set(runtime.plan.subjects.map(subject => subject.id)), [runtime.plan.subjects])
  const placeCastMark = React.useCallback((point: readonly [number, number, number]) => {
    const halfWidth = stage.sizeMeters[0] / 2
    const halfDepth = stage.sizeMeters[1] / 2
    dropXrMotionReferenceCastMark([
      Math.max(-halfWidth, Math.min(halfWidth, point[0] / scale)),
      0,
      Math.max(-halfDepth, Math.min(halfDepth, point[2] / scale)),
    ])
  }, [scale, stage.sizeMeters])
  const selectSubject = React.useCallback((subjectId: string) => {
    const result = controlXrSharedAssetControls({ operation: 'select-target', targetId: subjectId })
    if (!result.ok) selectBoundXrShotTarget(subjectId)
  }, [])

  return (
    <group
      name="agentic_os_xr_motion_reference_stage"
      renderOrder={THREE_RENDER_ORDER.groups - 10}
      userData={{ schema: runtime.plan.schema, stageId: stage.id, playheadSeconds: runtime.playheadSeconds, selectedMark: runtime.selectedMark }}
    >
      {!paused ? <XrKeyboardChoreographyRuntime /> : null}
      <XrStagePresetGeometry
        stage={stage}
        span={span}
        groundY={groundY}
        onFloorPoint={!paused && runtime.castMarkArmed ? placeCastMark : undefined}
        coordinateRootRef={coordinateRootRef}
      />
      <group name="agentic_os_xr_motion_cast_tracks">
        {runtime.plan.cast.map(track => (
          <CastTrack
            key={track.actorId}
            track={track}
            playheadSeconds={runtime.playheadSeconds}
            scale={scale}
            groundY={groundY}
            coordinateRootRef={coordinateRootRef}
            inputEnabled={!paused}
            renderLiveActor={!subjectIds.has(track.actorId)}
            livePose={!subjectIds.has(track.actorId) && track.actorId === motionActorId ? livePose : null}
            selectedActor={sharedAssetControls.selectedKind !== 'npc' && runtime.selectedShotTargetId === track.actorId}
            selectedMarkId={runtime.selectedMark?.kind === 'cast' && runtime.selectedMark.actorId === track.actorId
              ? runtime.selectedMark.markId
              : ''}
          />
        ))}
      </group>
      <group name="agentic_os_xr_scene_library_subjects">
        {runtime.plan.subjects.map(subject => {
          const track = runtime.plan.cast.find(candidate => candidate.actorId === subject.id)
          const selectedMarkId = runtime.selectedMark?.kind === 'cast' && runtime.selectedMark.actorId === subject.id
            ? runtime.selectedMark.markId
            : ''
          const actorControlMark = track ? resolveCastControlMark(track, selectedMarkId, runtime.playheadSeconds) : null
          const subjectPosition = track
            ? sampleXrMotionReferenceMarks(track.marks, runtime.playheadSeconds)
            : subject.position
          const animationPose = resolveMotionControlSubjectPose(subject, motionActorId, livePose)
            || sampleXrAnimationPose(track?.animation || null, runtime.playheadSeconds)
          const subjectNode = (
            <XrSceneLibrarySubject
              animationPose={animationPose}
              facingYRadians={track ? sampleXrMotionReferenceFacingY(track.marks, runtime.playheadSeconds) : 0}
              key={subject.id}
              subject={subject}
              position={xrMotionReferenceWorldPosition(subjectPosition, scale, groundY)}
              stageScale={scale}
              selected={sharedAssetControls.selectedKind !== 'npc' && runtime.selectedShotTargetId === subject.id}
              showIdentificationBounds={boundingBoxEnabled}
              onSelect={!paused ? () => selectSubject(subject.id) : undefined}
            />
          )
          return actorControlMark ? (
            <CastMarkControl
              key={subject.id}
              actorId={subject.id}
              controlSurface="actor"
              mark={actorControlMark}
              scale={scale}
              groundY={groundY}
              coordinateRootRef={coordinateRootRef}
              inputEnabled={!paused}
            >
              {subjectNode}
            </CastMarkControl>
          ) : subjectNode
        })}
      </group>
      <group name="agentic_os_xr_motion_camera_track">
        {runtime.plan.camera.slice(1).map((mark, index) => (
          <PathSegment
            key={`camera-path:${mark.id}`}
            left={runtime.plan.camera[index]!.pose.position}
            right={mark.pose.position}
            scale={scale}
            groundY={groundY}
            color="#f8fafc"
            thickness={Math.max(0.3, scale * 0.045)}
          />
        ))}
        {runtime.plan.camera.map((mark, index) => {
          const selected = runtime.selectedMark?.kind === 'camera' && runtime.selectedMark.markId === mark.id
          const position = xrMotionReferenceWorldPosition(mark.pose.position, scale, groundY)
          const target = xrMotionReferenceWorldPosition(mark.pose.target, scale, groundY)
          const direction = new THREE.Vector3(target[0] - position[0], target[1] - position[1], target[2] - position[2])
          const quaternion = direction.lengthSq() > 0.000001
            ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
            : new THREE.Quaternion()
          return (
            <group
              key={mark.id}
              name={`agentic_os_xr_motion_camera_mark_${index + 1}`}
              position={position}
              quaternion={quaternion}
              userData={{ markId: mark.id, moveId: mark.moveId, rig: mark.rig, sensorId: mark.settings.sensorId, lensMm: mark.settings.focalLengthMm, focusDistanceMeters: mark.settings.focusDistanceMeters, aspectRatio: mark.settings.aspectRatio, selected, kgXrAnimationControl: true }}
              onClick={!paused ? event => {
                event.stopPropagation()
                selectXrMotionReferenceCameraMark(mark.id)
              } : undefined}
              onPointerOver={!paused ? event => {
                event.stopPropagation()
                setStagePointerCursor(event, 'grab')
              } : undefined}
              onPointerOut={!paused ? event => setStagePointerCursor(event, 'default') : undefined}
            >
              <mesh>
                <coneGeometry args={[scale * 0.34, scale * 0.8, 4]} />
                <meshBasicMaterial color="#f8fafc" transparent opacity={0.92} depthWrite={false} />
              </mesh>
              <mesh position={[0, scale * 0.64, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[scale * 0.18, scale * 0.25, 24]} />
                <meshBasicMaterial color="#f8fafc" transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
              {selected ? (
                <mesh
                  name={`agentic_os_xr_motion_camera_mark_highlight_${index + 1}`}
                  position={[0, scale * 0.64, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                  renderOrder={THREE_RENDER_ORDER.overlays}
                  userData={{ markId: mark.id, selected: true }}
                >
                  <ringGeometry args={[scale * 0.32, scale * 0.45, 28]} />
                  <meshBasicMaterial color={XR_MOTION_REFERENCE_SELECTION_COLOR} transparent opacity={0.98} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
                </mesh>
              ) : null}
            </group>
          )
        })}
      </group>
    </group>
  )
}
