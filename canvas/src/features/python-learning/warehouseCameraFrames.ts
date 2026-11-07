import { sampleWarehouseInspection, WAREHOUSE_INSPECTION_FPS, WAREHOUSE_INSPECTION_SCENARIO_ID } from './warehouseCoverageRoutes'

export const WAREHOUSE_CAMERA_IDS = ['drone001', 'drone002', 'cctv'] as const
export type WarehouseCameraId = typeof WAREHOUSE_CAMERA_IDS[number]
export type DetectionFixture = Readonly<{
  id: string; label: string; confidence: number;
  box: Readonly<{ x: number; y: number; width: number; height: number }>;
}>
export const WAREHOUSE_CAMERAS: Record<WarehouseCameraId, { label: string; wifiMs: number }> = {
  drone001: { label: 'Drone 001', wifiMs: 180 },
  drone002: { label: 'Drone 002', wifiMs: 240 },
  cctv: { label: 'CCTV', wifiMs: 120 },
}
export const WAREHOUSE_INFERENCE_MS = 120
const fixture = (id: string, label: string, x: number, y: number, width: number, height: number, confidence: number): DetectionFixture => ({
  id, label, confidence, box: { x, y, width, height },
})

/** Reversible timeline projection: no frame queue, timers, capture, network or inference. */
export function sampleWarehouseCameraFrame(cameraId: WarehouseCameraId, seconds: number) {
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const latencyMs = WAREHOUSE_CAMERAS[cameraId].wifiMs + WAREHOUSE_INFERENCE_MS
  const captureIndex = Math.floor(time * WAREHOUSE_INSPECTION_FPS + 1e-7)
  const wifiIndex = Math.floor((time - WAREHOUSE_CAMERAS[cameraId].wifiMs / 1000) * WAREHOUSE_INSPECTION_FPS + 1e-7)
  const frameIndex = Math.floor((time - latencyMs / 1000) * WAREHOUSE_INSPECTION_FPS + 1e-7)
  const capturedSeconds = Math.max(0, frameIndex) / WAREHOUSE_INSPECTION_FPS
  const captured = sampleWarehouseInspection(capturedSeconds)
  const view = cameraId === 'cctv' ? 'overview' : cameraId === 'drone002' && captured.drone002Docked ? 'dock' : 'rack'
  const shift = Math.sin(capturedSeconds * 0.4) * 0.015
  const detections: DetectionFixture[] = frameIndex < 0 ? [] : view === 'rack' ? [
    fixture('rack-pallet-left', 'Pallet load', 0.085 + shift, 0.35, 0.21, 0.2, 0.94),
    fixture('rack-pallet-right', 'Pallet load', 0.72 + shift, 0.31, 0.19, 0.23, 0.92),
    fixture('rack-end-marker', 'Rack marker', 0.46 + shift, 0.42, 0.065, 0.09, 0.98),
  ] : view === 'dock' ? [
    fixture('dock-marker', 'Dock marker', 0.16 + shift, 0.29, 0.09, 0.15, 0.97),
    fixture('charging-pad', 'Charging bay', 0.38 + shift, 0.6, 0.26, 0.17, 0.95),
  ] : [
    fixture('charging-truck', 'Charging truck', 0.08 + Math.max(0, Math.min(0.3, (captured.actors.truck.position[0] + 60) / 200)), 0.55, 0.27, 0.17, 0.96),
    fixture('drone001', 'Drone 001', 0.55 + Math.max(-0.12, Math.min(0.12, captured.actors.drone001.position[0] / 80)), 0.38, 0.075, 0.055, 0.9),
  ]
  return {
    cameraId, view, captureIndex, wifiIndex, frameIndex, capturedSeconds, latencyMs,
    deliveredSeconds: capturedSeconds + latencyMs / 1000,
    frameId: frameIndex < 0 ? null : `${WAREHOUSE_INSPECTION_SCENARIO_ID}:${cameraId}:${frameIndex}`,
    detections, target: cameraId === 'cctv' ? 'warehouse overview'
      : captured.cameraTarget?.actorId === cameraId ? captured.cameraTarget.targetId
      : view === 'dock' ? 'charging dock' : 'inspection aisle',
  }
}
