import { Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three'
import type { ThreeCameraPose } from '@/hooks/store/types'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { resolveWorkspaceVisibleViewport } from '@/lib/zoom/workspaceVisibleViewport'

export type LearningAssetViewport = Readonly<{
  viewportW: number; viewportH: number; left: number; top: number; width: number; height: number
}>

/** Measure the existing surface and panels; this helper owns neither camera state nor layout. */
export function resolveLearningAssetViewport(ownerDocument: Document): LearningAssetViewport | undefined {
  const canvas = ownerDocument.querySelector<HTMLCanvasElement>('[data-kg-three-canvas-owner="1"] canvas')
  if (!canvas) return undefined
  const surface = canvas.getBoundingClientRect(), viewportW = surface.width, viewportH = surface.height
  if (!(viewportW > 0 && viewportH > 0)) return undefined
  const frame = resolveWorkspaceVisibleViewport({ viewportW, viewportH, workspaceEditorOverlayOpen: true,
    surfaceElement: canvas, ownerDocument })
  let { left, top, right, bottom } = frame
  const localRect = (element: Element | null) => {
    if (!element) return null
    const style = ownerDocument.defaultView?.getComputedStyle(element)
    if (style?.display === 'none' || style?.visibility === 'hidden') return null
    const rect = element.getBoundingClientRect()
    const value = { left: Math.max(0, rect.left - surface.left), top: Math.max(0, rect.top - surface.top),
      right: Math.min(viewportW, rect.right - surface.left), bottom: Math.min(viewportH, rect.bottom - surface.top) }
    return value.right > value.left && value.bottom > value.top ? value : null
  }
  // Native panels are inset from the surface edge, so the shared edge detector can miss them.
  const panelContent = ownerDocument.querySelector('[aria-label="Floating panel"]')
  const panels = new Set<Element>(ownerDocument.querySelectorAll('aside.ModalContainer:not([aria-label="Strybldr Timeline"])'))
  if (panelContent) panels.add(panelContent.closest('.ModalContainer') ?? panelContent)
  for (const element of panels) {
    const rect = localRect(element)
    if (rect && rect.left + rect.right >= viewportW && rect.left < right && rect.right > left
      && rect.top < bottom && rect.bottom > top) right = Math.min(right, rect.left - 12)
  }
  const timeline = localRect(ownerDocument.querySelector('[aria-label="Strybldr Timeline"]'))
  if (timeline && timeline.left < right && timeline.right > left && timeline.top < bottom && timeline.bottom > top) {
    bottom = Math.min(bottom, timeline.top - 12)
  }
  const controls = localRect(ownerDocument.querySelector('[aria-label="Lesson scene controls"]'))
  if (controls && controls.left < right && controls.right > left && controls.top < bottom && controls.bottom > top) {
    top = Math.max(top, controls.bottom + 12)
  }
  if (!(right > left && bottom > top)) return undefined
  return { viewportW, viewportH, left, top, width: right - left, height: bottom - top }
}

/** Frame the lesson once through the shared OrbitControls instance. */
export function applyLearningCameraPose(camera: PerspectiveCamera, controls: OrbitControls, canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect()
  const frame = resolveWorkspaceVisibleViewport({ viewportW: rect.width, viewportH: rect.height,
    workspaceEditorOverlayOpen: true, surfaceElement: canvas })
  const zoom = Math.min(1.5, Math.max(0.6, 1.5 * (frame.width - 100) / Math.max(1, rect.height * 0.36)))
  const pixelsPerMeter = Math.max(1, rect.height * 0.088 * zoom / 1.5)
  const visibleCenterShift = frame.left + frame.width / 2 - rect.width / 2
  const targetX = 2 - visibleCenterShift / pixelsPerMeter
  camera.up.set(0, 1, 0)
  camera.position.set(targetX + 10, 12, 4)
  camera.zoom = zoom
  camera.updateProjectionMatrix()
  controls.target.set(targetX, 0, 0)
  controls.update()
}

/** Close inspection uses the existing camera authority; asset geometry stays at its metre scale. */
export function learningAssetCameraPose(position: readonly [number, number, number], size: readonly [number, number, number],
  currentPose?: ThreeCameraPose | null, viewport?: LearningAssetViewport): ThreeCameraPose {
  if (!position.every(Number.isFinite) || !size.every(value => Number.isFinite(value) && value >= 0) || !size.some(value => value > 0)) {
    throw new Error('Asset camera framing requires a finite position and positive bounds.')
  }
  const fov = currentPose?.fov && currentPose.fov >= 10 && currentPose.fov <= 100 ? currentPose.fov : 50
  const radius = Math.hypot(...size) / 2
  let distance = Math.max(0.3, radius / Math.sin(fov * Math.PI / 360) * 1.5)
  const target = new Vector3(position[0], position[1] + size[1] / 2, position[2])
  const backward = new Vector3(1, 0.9, 1.15).normalize()
  if (viewport) {
    const { viewportW: w, viewportH: h, left, top, width, height } = viewport
    if (![w, h, left, top, width, height].every(Number.isFinite) || w <= 0 || h <= 0 || width <= 0 || height <= 0
      || left < 0 || top < 0 || left + width > w || top + height > h) throw new Error('Asset camera framing requires a finite visible viewport inside the canvas.')
    const padding = Math.min(16, width * 0.08, height * 0.08)
    const l = 2 * (left + padding) / w - 1, r = 2 * (left + width - padding) / w - 1
    const b = 1 - 2 * (top + height - padding) / h, t = 1 - 2 * (top + padding) / h
    const centerX = (l + r) / 2, centerY = (b + t) / 2
    const tanV = Math.tan(fov * Math.PI / 360), tanH = tanV * w / h
    // Perpendicular distances to all four off-axis frustum planes bound the entire sphere,
    // including perspective depth. Merely scaling by the visible width misses near corners.
    const clearance = Math.min((centerX - l) * tanH / Math.hypot(1, l * tanH),
      (r - centerX) * tanH / Math.hypot(1, r * tanH),
      (centerY - b) * tanV / Math.hypot(1, b * tanV), (t - centerY) * tanV / Math.hypot(1, t * tanV))
    distance = Math.max(distance, radius * 1.15 / clearance)
    const cameraRight = new Vector3(0, 1, 0).cross(backward).normalize()
    const cameraUp = backward.clone().cross(cameraRight)
    target.addScaledVector(cameraRight, -centerX * distance * tanH).addScaledVector(cameraUp, -centerY * distance * tanV)
  }
  const camera = backward.multiplyScalar(distance).add(target)
  const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(camera, target, new Vector3(0, 1, 0)))
  return { position: { x: camera.x, y: camera.y, z: camera.z }, target: { x: target.x, y: target.y, z: target.z },
    quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }, fov, zoom: 1 }
}
