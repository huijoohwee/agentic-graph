import type { PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { resolveWorkspaceVisibleViewport } from '@/lib/zoom/workspaceVisibleViewport'

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
  camera.position.set(targetX + 8, 10, 10)
  camera.zoom = zoom
  camera.updateProjectionMatrix()
  controls.target.set(targetX, 0, 0)
  controls.update()
}
