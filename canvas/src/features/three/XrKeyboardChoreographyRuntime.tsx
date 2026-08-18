import React from 'react'
import { isEditableTarget } from '@/lib/canvas/arrangeShortcuts'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  publishCameraFramingRuntime,
  readCameraFramingRuntime,
} from '@/features/strybldr/cameraFramingRuntime'
import type { StrybldrCameraSettings } from '@/features/strybldr/strybldrCamera'
import type { XrMotionReferenceVector } from './xrMotionReferenceModel'
import {
  readXrMotionReferenceRuntime,
  setXrMotionReferenceCameraMarkChoreography,
  type XrMotionReferenceRuntimeSnapshot,
} from './xrMotionReferenceRuntime'
import {
  claimThreeObjectKeyboardInputOwnership,
  releaseThreeObjectKeyboardInputOwnership,
} from './threeObjectInputOwnership'
import { readXrPhysicsRuntime, readXrPhysicsRuntimeFrame } from './xrPhysicsRuntime'
import {
  THREE_KEYBOARD_HOLD_DELAY_MS,
  normalizeThreeKeyboardKey,
  readThreeKeyboardMovementKey,
  resolveThreeCameraKeyboardFraming,
  resolveThreeKeyboardFrameAmount,
  resolveThreeKeyboardTap,
  type ThreeKeyboardEvent,
  type ThreeKeyboardMovementKey,
} from './threeKeyboardChoreography'
import { resolveXrSubjectKeyboardMotion } from './xrSubjectMotionConstraints'
import { applyXrConstrainedCastMarkChoreography } from './xrConstrainedCastMarkRuntime'
import { resolveXrSharedAssetCastMarkTarget } from './xrSharedAssetControlRuntime'

type XrKeyboardChoreographyTarget = Readonly<{
  changed: boolean
  kind: 'camera-framing' | 'camera-mark' | 'cast-mark'
  ownerId: string
  actorId?: string
  anchorId?: string
  markId?: string
  nextPosition?: XrMotionReferenceVector
  nextSettings?: StrybldrCameraSettings
}>

function cameraSettingsEqual(left: StrybldrCameraSettings, right: StrybldrCameraSettings): boolean {
  return left.angle === right.angle
    && left.level === right.level
    && left.shot === right.shot
    && left.note === right.note
    && left.orbitX === right.orbitX
    && left.orbitY === right.orbitY
    && left.focalLengthMm === right.focalLengthMm
}

function resolveCastTarget(
  runtime: XrMotionReferenceRuntimeSnapshot,
  keys: Iterable<ThreeKeyboardMovementKey>,
  distanceMeters: number,
): XrKeyboardChoreographyTarget | null {
  const selection = resolveXrSharedAssetCastMarkTarget(runtime)
  if (!selection) return null
  const physics = readXrPhysicsRuntime()
  const mark = selection.mark
  const motion = resolveXrSubjectKeyboardMotion({
    actorId: selection.actorId,
    distanceMeters,
    keys,
    markId: mark.id,
    physics,
    physicsFrame: physics.phase === 'stopped' ? undefined : readXrPhysicsRuntimeFrame(),
    plan: runtime.plan,
    position: mark.position,
    timeSeconds: mark.timeSeconds,
  })
  if (!motion || motion.status === 'physics-owned') return null
  const nextPosition = motion.position
  return Object.freeze({
    actorId: selection.actorId,
    changed: nextPosition[0] !== mark.position[0] || nextPosition[2] !== mark.position[2],
    kind: 'cast-mark',
    markId: mark.id,
    nextPosition,
    ownerId: `xr:keyboard:cast:${selection.actorId}:${mark.id}`,
  })
}

function resolveCameraMarkTarget(
  runtime: XrMotionReferenceRuntimeSnapshot,
  keys: Iterable<string>,
  amount: number,
): XrKeyboardChoreographyTarget | null {
  const selection = runtime.selectedMark
  if (selection?.kind !== 'camera') return null
  const mark = runtime.plan.camera.find(candidate => candidate.id === selection.markId)
  if (!mark) return null
  const nextSettings = resolveThreeCameraKeyboardFraming({ amount, keys, settings: mark.settings })
  if (!nextSettings) return null
  return Object.freeze({
    anchorId: mark.anchorId,
    changed: !cameraSettingsEqual(nextSettings, mark.settings),
    kind: 'camera-mark',
    markId: mark.id,
    nextSettings,
    ownerId: `xr:keyboard:camera-mark:${mark.id}`,
  })
}

function resolveCameraFramingTarget(
  keys: Iterable<string>,
  amount: number,
): XrKeyboardChoreographyTarget | null {
  const state = useGraphStore.getState()
  if (state.floatingPanelOpen !== true || state.floatingPanelView !== 'camera') return null
  const framing = readCameraFramingRuntime()
  const nextSettings = resolveThreeCameraKeyboardFraming({ amount, keys, settings: framing.settings })
  if (!nextSettings) return null
  const anchorId = framing.anchorId || 'canvas-camera'
  return Object.freeze({
    anchorId,
    changed: !cameraSettingsEqual(nextSettings, framing.settings),
    kind: 'camera-framing',
    nextSettings,
    ownerId: `xr:keyboard:camera-framing:${anchorId}`,
  })
}

export function resolveXrKeyboardChoreographyTarget(input: Readonly<{
  amount: number
  keys: Iterable<ThreeKeyboardMovementKey>
  runtime: XrMotionReferenceRuntimeSnapshot
}>): XrKeyboardChoreographyTarget | null {
  const castTarget = resolveCastTarget(input.runtime, input.keys, input.amount)
  if (castTarget) return castTarget
  const cameraBlocked = useGraphStore.getState().timelineTransportPlaying === true
    && input.runtime.plan.camera.length > 0
  if (cameraBlocked) return null
  return resolveCameraMarkTarget(input.runtime, input.keys, input.amount)
    || resolveCameraFramingTarget(input.keys, input.amount)
}

export function resolveXrObjectKeyboardMotionTarget(
  runtime: XrMotionReferenceRuntimeSnapshot,
  event: ThreeKeyboardEvent,
): XrKeyboardChoreographyTarget | null {
  const tap = resolveThreeKeyboardTap({ event, target: 'object' })
  return tap ? resolveCastTarget(runtime, [tap.key], tap.amount) : null
}

export function resolveXrObjectKeyboardMotionFrameTarget(
  runtime: XrMotionReferenceRuntimeSnapshot,
  keys: Iterable<ThreeKeyboardMovementKey>,
  distanceMeters: number,
): XrKeyboardChoreographyTarget | null {
  return resolveCastTarget(runtime, keys, distanceMeters)
}

function targetMotionKind(runtime: XrMotionReferenceRuntimeSnapshot): 'camera' | 'object' {
  return resolveXrSharedAssetCastMarkTarget(runtime) ? 'object' : 'camera'
}

function isSelectedXrObjectTimelineLane(target: Element | null): boolean {
  return Boolean(target?.closest(
    '[data-kg-xr-shot-target-bar][data-kg-xr-timeline-lane-selected="1"], '
    + '[data-kg-xr-shot-target-bar][aria-pressed="true"], '
    + '[data-kg-xr-shot-target-lane-label][aria-pressed="true"]',
  ))
}

function isKeyboardMotionSurface(target: EventTarget | null): boolean {
  if (isEditableTarget(target)) return false
  const element = target instanceof Element ? target : null
  if (element?.closest('[data-kg-xr-lane-cast-mark][aria-pressed="true"], [data-kg-xr-lane-camera-mark][aria-pressed="true"]')) return true
  if (isSelectedXrObjectTimelineLane(element)) return true
  const state = useGraphStore.getState()
  if (state.floatingPanelOpen === true
    && state.floatingPanelView === 'camera'
    && element?.closest('[data-kg-floating-panel-view-trigger="camera"]')) return true
  return !element?.closest('button, a, summary, [role="button"], [role="menuitem"], [role="option"], [role="slider"], [role="tab"]')
}

function applyTarget(target: XrKeyboardChoreographyTarget): void {
  if (!target.changed) return
  if (target.kind === 'cast-mark' && target.actorId && target.markId && target.nextPosition) {
    applyXrConstrainedCastMarkChoreography({
      actorId: target.actorId,
      markId: target.markId,
      position: target.nextPosition,
    })
    return
  }
  if (!target.nextSettings || !target.anchorId) return
  if (target.kind === 'camera-mark' && target.markId) {
    setXrMotionReferenceCameraMarkChoreography({
      markId: target.markId,
      settings: target.nextSettings,
    })
  }
  publishCameraFramingRuntime({
    anchorId: target.anchorId,
    settings: target.nextSettings,
    source: 'panel',
  })
}

export function XrKeyboardChoreographyRuntime() {
  const activeKeysRef = React.useRef(new Set<ThreeKeyboardMovementKey>())
  const fineMotionRef = React.useRef(false)
  const frameRequestRef = React.useRef<number | null>(null)
  const holdReadyAtRef = React.useRef(0)
  const previousFrameTimeRef = React.useRef<number | null>(null)
  const objectOwnershipOwnerRef = React.useRef('')
  const ownerIdRef = React.useRef('')

  React.useEffect(() => {
    const releaseOwnership = () => {
      if (frameRequestRef.current !== null) window.cancelAnimationFrame(frameRequestRef.current)
      frameRequestRef.current = null
      fineMotionRef.current = false
      holdReadyAtRef.current = 0
      previousFrameTimeRef.current = null
      const objectOwnerId = objectOwnershipOwnerRef.current
      objectOwnershipOwnerRef.current = ''
      ownerIdRef.current = ''
      activeKeysRef.current.clear()
      if (objectOwnerId) releaseThreeObjectKeyboardInputOwnership(objectOwnerId)
    }

    function scheduleAnimationFrame() {
      if (frameRequestRef.current !== null) return
      frameRequestRef.current = window.requestAnimationFrame(runAnimationFrame)
    }

    function runAnimationFrame(timestamp: number) {
      frameRequestRef.current = null
      if (!ownerIdRef.current || activeKeysRef.current.size === 0) {
        releaseOwnership()
        return
      }
      const previousFrameTime = previousFrameTimeRef.current
      previousFrameTimeRef.current = timestamp
      if (previousFrameTime !== null && timestamp > holdReadyAtRef.current) {
        const runtime = readXrMotionReferenceRuntime()
        const motionKind = targetMotionKind(runtime)
        const amount = resolveThreeKeyboardFrameAmount({
          deltaMs: timestamp - Math.max(previousFrameTime, holdReadyAtRef.current),
          fine: fineMotionRef.current,
          target: motionKind,
        })
        const target = resolveXrKeyboardChoreographyTarget({
          amount,
          keys: activeKeysRef.current,
          runtime,
        })
        if (!target || target.ownerId !== ownerIdRef.current) {
          releaseOwnership()
          return
        }
        applyTarget(target)
      }
      scheduleAnimationFrame()
    }

    const isolateKeyboardEvent = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = normalizeThreeKeyboardKey(event.key)
      if (key === 'Alt' || key === 'Control' || key === 'Meta') {
        if (activeKeysRef.current.size > 0) releaseOwnership()
        return
      }
      if (key === 'Shift') {
        if (activeKeysRef.current.size > 0) fineMotionRef.current = true
        return
      }
      if (!isKeyboardMotionSurface(event.target)) return
      const runtime = readXrMotionReferenceRuntime()
      const motionKind = targetMotionKind(runtime)
      const tap = resolveThreeKeyboardTap({ event, target: motionKind })
      if (!tap) return
      const target = resolveXrKeyboardChoreographyTarget({ amount: tap.amount, keys: [tap.key], runtime })
      if (!target) return
      if (ownerIdRef.current && ownerIdRef.current !== target.ownerId) releaseOwnership()
      if (target.kind === 'cast-mark') {
        if (!claimThreeObjectKeyboardInputOwnership(target.ownerId)) return
        objectOwnershipOwnerRef.current = target.ownerId
      }
      ownerIdRef.current = target.ownerId
      fineMotionRef.current = event.shiftKey === true
      isolateKeyboardEvent(event)
      if (activeKeysRef.current.has(tap.key)) return
      activeKeysRef.current.add(tap.key)
      applyTarget(target)
      if (activeKeysRef.current.size === 1) {
        holdReadyAtRef.current = performance.now() + THREE_KEYBOARD_HOLD_DELAY_MS
        previousFrameTimeRef.current = null
      }
      scheduleAnimationFrame()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = normalizeThreeKeyboardKey(event.key)
      if (key === 'Shift') {
        fineMotionRef.current = false
        return
      }
      const movementKey = readThreeKeyboardMovementKey(key)
      if (!movementKey || !activeKeysRef.current.has(movementKey)) return
      isolateKeyboardEvent(event)
      fineMotionRef.current = event.shiftKey === true
      activeKeysRef.current.delete(movementKey)
      if (activeKeysRef.current.size === 0) releaseOwnership()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') releaseOwnership()
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    window.addEventListener('blur', releaseOwnership)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true } as AddEventListenerOptions)
      window.removeEventListener('keyup', handleKeyUp, { capture: true } as AddEventListenerOptions)
      window.removeEventListener('blur', releaseOwnership)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      releaseOwnership()
    }
  }, [])

  return null
}
