import React from 'react'
import { photoFieldOfView } from './immersivePhotoProjection'
import { useFrame } from '@react-three/fiber'
import { Euler, MathUtils, PerspectiveCamera, Vector3 } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { bindImmersiveMediaCameraPointerControls } from './immersiveMediaCameraPointerControls'
import {
  playImmersiveMediaIntro,
  readImmersiveMediaSnapshot,
  resetImmersiveMediaView,
  setImmersiveMediaView,
  subscribeImmersiveMediaSnapshot,
  zoomImmersiveMedia,
} from './immersiveMediaRuntime'

type SavedCamera = Readonly<{
  position: Vector3
  rotation: Euler
  fieldOfView: number
  enablePan: boolean
  enableRotate: boolean
  enableZoom: boolean
}>

function interactiveTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return !!element?.closest?.(
    'input, textarea, select, button, a, [contenteditable="true"], [role="button"], [role="textbox"]',
  )
}

export function useImmersiveMediaCameraControls({
  camera,
  controls,
  domElement,
  enabled,
}: {
  camera: PerspectiveCamera
  controls: OrbitControls
  domElement: HTMLElement
  enabled: boolean
}) {
  const snapshot = React.useSyncExternalStore(
    subscribeImmersiveMediaSnapshot,
    readImmersiveMediaSnapshot,
    readImmersiveMediaSnapshot,
  )
  const active = enabled && snapshot.active
  const savedRef = React.useRef<SavedCamera | null>(null)
  const introRef = React.useRef({
    revision: snapshot.introRevision,
    startedAt: 0,
  })

  React.useEffect(() => {
    introRef.current = { revision: snapshot.introRevision, startedAt: 0 }
  }, [snapshot.introRevision])

  React.useEffect(() => {
    if (!active) {
      const saved = savedRef.current
      if (!saved) return
      camera.position.copy(saved.position)
      camera.rotation.copy(saved.rotation)
      camera.fov = saved.fieldOfView
      camera.updateProjectionMatrix()
      controls.enablePan = saved.enablePan
      controls.enableRotate = saved.enableRotate
      controls.enableZoom = saved.enableZoom
      savedRef.current = null
      return
    }
    if (!savedRef.current) {
      savedRef.current = Object.freeze({
        position: camera.position.clone(),
        rotation: camera.rotation.clone(),
        fieldOfView: camera.fov,
        enablePan: controls.enablePan,
        enableRotate: controls.enableRotate,
        enableZoom: controls.enableZoom,
      })
    }
    controls.enabled = false
    controls.enablePan = false
    controls.enableRotate = false
    controls.enableZoom = false
  }, [active, camera, controls])

  React.useEffect(() => {
    if (!active) return
    const unbindPointerControls = bindImmersiveMediaCameraPointerControls(domElement)
    const onKeyDown = (event: KeyboardEvent) => {
      const media = readImmersiveMediaSnapshot()
      if (!media.navigation.keyboardActions || interactiveTarget(event.target)) return
      const view = media.view
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        setImmersiveMediaView({ yawDegrees: view.yawDegrees - 6 })
      } else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        setImmersiveMediaView({ yawDegrees: view.yawDegrees + 6 })
      } else if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
        setImmersiveMediaView({ pitchDegrees: view.pitchDegrees + 5 })
      } else if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
        setImmersiveMediaView({ pitchDegrees: view.pitchDegrees - 5 })
      } else if (event.key === '+' || event.key === '=') zoomImmersiveMedia('in')
      else if (event.key === '-' || event.key === '_') zoomImmersiveMedia('out')
      else if (event.key === '0') resetImmersiveMediaView()
      else if (event.key.toLowerCase() === 'i') playImmersiveMediaIntro()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      unbindPointerControls()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [active, domElement])

  useFrame(({ clock }) => {
    if (!active) return
    controls.enabled = false
    camera.position.set(0, 0, snapshot.source.photo ? 0 : 0.01)
    const intro = introRef.current
    if (!intro.startedAt) intro.startedAt = clock.elapsedTime
    const elapsed = clock.elapsedTime - intro.startedAt
    const duration = Math.max(0.25, snapshot.transitionDurationMs / 1000)
    const progress = Math.min(1, elapsed / duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    const introOffset = !snapshot.source.photo && intro.revision === snapshot.introRevision ? (1 - eased) * -42 : 0
    const yaw = MathUtils.degToRad(snapshot.view.yawDegrees + introOffset)
    const pitch = MathUtils.degToRad(snapshot.view.pitchDegrees)
    camera.rotation.set(pitch, yaw, 0, 'YXZ')
    const fieldOfView = snapshot.source.photo ? photoFieldOfView(snapshot.source.photo, camera.aspect, snapshot.view.fieldOfViewDegrees) : Math.max(
      24,
      Math.min(115, snapshot.view.fieldOfViewDegrees + snapshot.view.lensStrength * 18),
    )
    if (Math.abs(camera.fov - fieldOfView) > 0.01) {
      camera.fov = fieldOfView
      camera.updateProjectionMatrix()
    }
  })
}
