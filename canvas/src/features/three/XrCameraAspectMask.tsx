import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  formatCameraOptics,
  resolveCameraAspectRatio,
} from '@/features/strybldr/cameraOptics'
import {
  readCameraFramingRuntime,
  subscribeCameraFramingRuntime,
} from '@/features/strybldr/cameraFramingRuntime'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from './xrMotionReferenceRuntime'
import { sampleXrMotionReferenceCameraSettings } from './xrMotionReferenceSampling'

type MaskGeometry = Readonly<{
  barHeight: number
  barWidth: number
}>

function resolveMaskGeometry(width: number, height: number, targetRatio: number): MaskGeometry {
  if (!(width > 0) || !(height > 0) || !(targetRatio > 0)) return { barHeight: 0, barWidth: 0 }
  const viewportRatio = width / height
  if (viewportRatio > targetRatio) return { barHeight: 0, barWidth: Math.max(0, (width - height * targetRatio) / 2) }
  return { barHeight: Math.max(0, (height - width / targetRatio) / 2), barWidth: 0 }
}

export function XrCameraAspectMask() {
  const rootRef = React.useRef<HTMLElement | null>(null)
  const [size, setSize] = React.useState({ width: 0, height: 0 })
  const playing = useGraphStore(state => state.timelineTransportPlaying)
  const framing = React.useSyncExternalStore(
    subscribeCameraFramingRuntime,
    readCameraFramingRuntime,
    readCameraFramingRuntime,
  )
  const runtime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )

  const selectedCameraMark = runtime.selectedMark?.kind === 'camera'
    ? runtime.plan.camera.find(mark => mark.id === runtime.selectedMark?.markId)
    : null
  const sampledSettings = playing
    ? sampleXrMotionReferenceCameraSettings(runtime.plan.camera, runtime.playheadSeconds)
    : null
  const settings = sampledSettings
    || selectedCameraMark?.settings
    || (framing.claimed ? framing.settings : null)
  const projectionVisible = settings !== null

  React.useEffect(() => {
    if (!projectionVisible) return undefined
    const root = rootRef.current
    if (!root) return undefined
    const measure = () => setSize({ width: root.clientWidth, height: root.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [projectionVisible])

  if (!settings) return null

  const aspect = resolveCameraAspectRatio(settings.aspectRatio)
  const geometry = resolveMaskGeometry(size.width, size.height, aspect.value)
  const activeWidth = Math.max(0, size.width - geometry.barWidth * 2)
  const activeHeight = Math.max(0, size.height - geometry.barHeight * 2)
  const projectionSource = sampledSettings
    ? 'timeline-playback'
    : selectedCameraMark
      ? 'selected-timeline-mark'
      : framing.source === 'panel'
        ? 'floating-panel-camera'
        : `camera-${framing.source}`

  return (
    <aside
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-[3] overflow-hidden"
      role="img"
      aria-label={`XR camera ${settings.aspectRatio} aspect mask; ${formatCameraOptics(settings)}`}
      data-kg-xr-camera-aspect-mask="1"
      data-kg-camera-optics-projection="xr-viewport"
      data-kg-camera-sensor={settings.sensorId}
      data-kg-camera-focal-length-mm={settings.focalLengthMm}
      data-kg-camera-focus-distance-m={settings.focusDistanceMeters}
      data-kg-camera-aspect-ratio={settings.aspectRatio}
      data-kg-camera-optics-source={projectionSource}
    >
      {geometry.barHeight > 0 ? (
        <>
          <span className="absolute inset-x-0 top-0 bg-black/75" style={{ height: geometry.barHeight }} />
          <span className="absolute inset-x-0 bottom-0 bg-black/75" style={{ height: geometry.barHeight }} />
        </>
      ) : null}
      {geometry.barWidth > 0 ? (
        <>
          <span className="absolute inset-y-0 left-0 bg-black/75" style={{ width: geometry.barWidth }} />
          <span className="absolute inset-y-0 right-0 bg-black/75" style={{ width: geometry.barWidth }} />
        </>
      ) : null}
      <span
        className="absolute border border-white/35"
        style={{ left: geometry.barWidth, top: geometry.barHeight, width: activeWidth, height: activeHeight }}
      >
        <span className="absolute inset-[5%] border border-dashed border-white/20" />
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-1 text-[9px] font-semibold text-white/85">
          {settings.aspectRatio} · {settings.sensorId} · {settings.focalLengthMm}mm · {settings.focusDistanceMeters}m
        </span>
      </span>
    </aside>
  )
}
