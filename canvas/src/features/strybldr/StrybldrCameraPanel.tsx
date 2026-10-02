import React from 'react'
import { Camera, Layers } from 'lucide-react'
import {
  isPointOnCameraOrbitHandle,
  resolveCameraOrbitPreviewSvgPoint,
  resolveCameraOrbitSphereGridHighlight,
  resolveCameraOrbitSphereGridMeridianGeometry,
  resolveCameraOrbitSphereGridPointFromRenderedPoint,
  resolveCameraOrbitSphereLatitudeRow,
  resolveCameraOrbitSphereOrbitFromGridPoint,
  resolveCameraOrbitSpherePose,
  type CameraOrbitFrameAwareOptions,
  type CameraOrbitSphereConfig,
  type CameraOrbitSphereFrameRect,
  type CameraOrbitSphereGridPoint,
  type CameraOrbitSpherePoseOptions,
} from '@/lib/camera/orbitSphere'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'
import { PanelField, PanelTextarea } from '@/lib/ui/panelFormControls'
import {
  STRYBLDR_CAMERA_ANGLES,
  STRYBLDR_CAMERA_LEVELS,
  STRYBLDR_CAMERA_SHOTS,
  formatStrybldrCameraSettings,
  getStrybldrCameraLabel,
  resolveStrybldrCameraOrbit,
  type StrybldrCameraAngle,
  type StrybldrCameraLevel,
  type StrybldrCameraSettings,
  type StrybldrCameraShot,
} from './strybldrCamera'
import { StrybldrCameraOpticsSection } from './StrybldrCameraOpticsSection'

type StrybldrCameraPanelProps = {
  selectedCardTitle: string
  settings: StrybldrCameraSettings
  previewImageUrl?: string | null
  onSettingsChange: (settings: StrybldrCameraSettings) => void
  onReframe: (settings: StrybldrCameraSettings) => void
}

type CameraOptionValue = StrybldrCameraAngle | StrybldrCameraLevel | StrybldrCameraShot

type CameraSegmentedControlProps<T extends CameraOptionValue> = {
  ariaLabel: string
  value: T
  options: readonly T[]
  onChange: (value: T) => void
}

const STRYBLDR_CAMERA_SPHERE_CENTER_X = 140
const STRYBLDR_CAMERA_SPHERE_CENTER_Y = 120
const STRYBLDR_CAMERA_SHOT_FRAMES: Record<StrybldrCameraShot, CameraOrbitSphereFrameRect> = {
  wide: {
    x: 87.25,
    y: 90.328125,
    width: 105.5,
    height: 59.34375,
  },
  medium: {
    x: 99.25,
    y: 97.078125,
    width: 81.5,
    height: 45.84375,
  },
  'close-up': {
    x: 111.25,
    y: 103.828125,
    width: 57.5,
    height: 32.34375,
  },
} as const
const STRYBLDR_CAMERA_SPHERE_ORBIT_RADIUS = 62
const STRYBLDR_CAMERA_HANDLE_BODY_RECT = {
  x: -7,
  y: -5,
  width: 11,
  height: 10,
  radius: 1.5,
} as const
const STRYBLDR_CAMERA_HANDLE_LENS_RECT = {
  x: 4,
  y: -3.5,
  width: 4,
  height: 7,
  radius: 0.5,
} as const
const STRYBLDR_CAMERA_SPHERE_GRID_OPACITY = {
  outline: 0.2,
  latitude: 0.16,
  axis: 0.14,
  longitude: 0.1,
  activeLatitude: 0.56,
} as const
const STRYBLDR_CAMERA_SPHERE_LATITUDE_ROWS = [
  { degree: -90, key: 'bottom-pole', cy: 187.53994388482693, rx: 43.4533796671228, ry: 8.690675933424561 },
  { degree: -45, key: 'bottom', cy: 161, rx: 71.01408311032398, ry: 14.202816622064796 },
  { degree: 0, key: 'equator', cy: 120, rx: 82, ry: 16.400000000000002 },
  { degree: 45, key: 'upper', cy: 80.25, rx: 71.01408311032398, ry: 14.202816622064796 },
  { degree: 90, key: 'top', cy: 52.460056115173074, rx: 43.4533796671228, ry: 8.690675933424561 },
] as const
const STRYBLDR_CAMERA_SPHERE_LONGITUDE_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315] as const
const STRYBLDR_CAMERA_SPHERE_LATITUDE_DEGREES = [-90, -45, 0, 45, 90] as const
const STRYBLDR_CAMERA_ORBIT_LONGITUDE_SPAN_DEGREES = 180
const STRYBLDR_CAMERA_SPHERE_ACTIVE_STROKE_OPACITY = 0.58
const STRYBLDR_CAMERA_SPHERE_ACTIVE_MERIDIAN_OPACITY = 0.68
const STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG: CameraOrbitSphereConfig<
  typeof STRYBLDR_CAMERA_SPHERE_LONGITUDE_DEGREES[number],
  typeof STRYBLDR_CAMERA_SPHERE_LATITUDE_DEGREES[number]
> = {
  centerX: STRYBLDR_CAMERA_SPHERE_CENTER_X,
  centerY: STRYBLDR_CAMERA_SPHERE_CENTER_Y,
  radius: 82,
  longitudeSpanDegrees: STRYBLDR_CAMERA_ORBIT_LONGITUDE_SPAN_DEGREES,
  longitudeDegrees: STRYBLDR_CAMERA_SPHERE_LONGITUDE_DEGREES,
  latitudeDegrees: STRYBLDR_CAMERA_SPHERE_LATITUDE_DEGREES,
  latitudeRows: STRYBLDR_CAMERA_SPHERE_LATITUDE_ROWS,
}
const STRYBLDR_CAMERA_FRAME_AWARE_OPTIONS: CameraOrbitFrameAwareOptions = {
  clearance: STRYBLDR_CAMERA_HANDLE_BODY_RECT.height * 0.36,
  focusYRatio: 0.78,
  maxY: STRYBLDR_CAMERA_SPHERE_CENTER_Y + STRYBLDR_CAMERA_SPHERE_ORBIT_RADIUS,
}
const STRYBLDR_CAMERA_POSE_OPTIONS: CameraOrbitSpherePoseOptions = {
  frameAware: STRYBLDR_CAMERA_FRAME_AWARE_OPTIONS,
}
const STRYBLDR_CAMERA_PREVIEW_VIEWBOX = {
  width: 280,
  height: 240,
} as const

function CameraSegmentedControl<T extends CameraOptionValue>({
  ariaLabel,
  value,
  options,
  onChange,
}: CameraSegmentedControlProps<T>) {
  const selectedIndex = Math.max(0, options.indexOf(value))
  const segmentWidthPercent = 100 / Math.max(1, options.length)
  const leftClipPercent = selectedIndex * segmentWidthPercent
  const rightClipPercent = 100 - (selectedIndex + 1) * segmentWidthPercent
  return (
    <section
      className={cn('min-w-0 rounded-[8px] border px-0.5 py-1', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
      aria-label={ariaLabel}
      data-kg-strybldr-camera-segmented-control="1"
      data-kg-strybldr-camera-shot-tabs={ariaLabel === 'Strybldr camera shot size' ? '1' : undefined}
    >
      <section className="relative w-full overflow-hidden rounded-md" role="tablist" aria-label={ariaLabel}>
        <section className="flex h-full min-w-0">
          {options.map(option => {
            const selected = value === option
            return (
              <section key={option} className="h-full min-w-0 flex-1">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    'h-full w-full min-w-0 p-1.5 text-sm font-semibold transition-colors focus:outline-none',
                    selected ? UI_THEME_TOKENS.text.primary : cn(UI_THEME_TOKENS.text.secondary, UI_THEME_TOKENS.button.hoverText),
                  )}
                  onClick={() => onChange(option)}
                >
                  <span className="block truncate">{getStrybldrCameraLabel(option)}</span>
                </button>
              </section>
            )
          })}
        </section>
        <section
          className="pointer-events-none absolute inset-0"
          aria-hidden={true}
          data-kg-strybldr-camera-selected-overlay="1"
          style={{
            clipPath: `inset(0 ${rightClipPercent}% 0 ${leftClipPercent}% round 6px)`,
            transition: 'clip-path 150ms ease-out',
            willChange: 'clip-path',
            outline: '1px solid transparent',
            outlineOffset: '-1px',
          }}
        >
          <section className="flex h-full min-w-0">
            {options.map(option => (
              <button
                key={option}
                type="button"
                tabIndex={-1}
                className="pointer-events-none h-full min-w-0 flex-1 bg-black/10 p-1.5 text-sm font-semibold text-black"
                aria-hidden={true}
              >
                <span className="block truncate">{getStrybldrCameraLabel(option)}</span>
              </button>
            ))}
          </section>
        </section>
      </section>
    </section>
  )
}

const resolveStrybldrCameraLongitudeForAngle = (angle: StrybldrCameraAngle) => {
  if (angle === 'left-side') return 315
  if (angle === 'right-side') return 45
  return 0
}

const resolveStrybldrCameraLatitudeForLevel = (level: StrybldrCameraLevel) => {
  if (level === 'high-angle') return 45
  if (level === 'low-angle') return -45
  return 0
}

const resolveStrybldrCameraControlOrbit = (angle: StrybldrCameraAngle, level: StrybldrCameraLevel) => {
  const gridPoint = {
    longitude: resolveStrybldrCameraLongitudeForAngle(angle),
    latitude: angle === 'overhead' ? 90 : resolveStrybldrCameraLatitudeForLevel(level),
  } as CameraOrbitSphereGridPoint<
    typeof STRYBLDR_CAMERA_SPHERE_LONGITUDE_DEGREES[number],
    typeof STRYBLDR_CAMERA_SPHERE_LATITUDE_DEGREES[number]
  >
  return resolveCameraOrbitSphereOrbitFromGridPoint(STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG, gridPoint)
}

const resolveStrybldrCameraSpherePose = (orbitX: number, orbitY: number, frame: { x: number; y: number; width: number; height: number }) => {
  return resolveCameraOrbitSpherePose(STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG, orbitX, orbitY, frame, STRYBLDR_CAMERA_POSE_OPTIONS)
}

const isPointOnStrybldrCameraHandle = (point: { x: number; y: number }, settings: Pick<StrybldrCameraSettings, 'orbitX' | 'orbitY' | 'shot'>) => {
  const pose = resolveStrybldrCameraSpherePose(settings.orbitX, settings.orbitY, STRYBLDR_CAMERA_SHOT_FRAMES[settings.shot])
  return isPointOnCameraOrbitHandle(point, pose, [STRYBLDR_CAMERA_HANDLE_BODY_RECT, STRYBLDR_CAMERA_HANDLE_LENS_RECT], 2)
}

function StrybldrCameraSphereGraphic({
  orbitX,
  orbitY,
  shot,
  previewImageUrl,
}: Pick<StrybldrCameraSettings, 'orbitX' | 'orbitY' | 'shot'> & { previewImageUrl?: string | null }) {
  const reactId = React.useId()
  const safeId = reactId.replace(/:/g, '')
  const rayId = `strybldr-camera-ray-${safeId}`
  const frame = STRYBLDR_CAMERA_SHOT_FRAMES[shot]
  const pose = resolveStrybldrCameraSpherePose(orbitX, orbitY, frame)
  const activeGridPoint = resolveCameraOrbitSphereGridHighlight(STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG, orbitX, orbitY)
  const activeLatitudeGeometry = resolveCameraOrbitSphereLatitudeRow(STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG, activeGridPoint.latitude)
  const activeMeridianGeometry = resolveCameraOrbitSphereGridMeridianGeometry(STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG, activeGridPoint.longitude)
  return (
    <svg
      className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing"
      viewBox="0 0 280 240"
      aria-hidden={true}
    >
      <defs>
        <linearGradient id={rayId} gradientUnits="userSpaceOnUse" x1={pose.cameraX} y1={pose.cameraY} x2={pose.rayTargetX} y2={pose.rayTargetY}>
          <stop offset="0%" stopColor="#FFEACD" stopOpacity="0.72" />
          <stop offset="58%" stopColor="#FFEACD" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#FFEACD" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="#858781" strokeWidth="1">
        <circle cx="140" cy="120" r="82" opacity={STRYBLDR_CAMERA_SPHERE_GRID_OPACITY.outline} data-kg-strybldr-camera-grid-shell="1" />
        {STRYBLDR_CAMERA_SPHERE_LATITUDE_ROWS.map(row => {
          const active = activeGridPoint.latitude === row.degree
          return (
            <ellipse
              key={row.key}
              cx="140"
              cy={row.cy}
              rx={row.rx}
              ry={row.ry}
              opacity={active ? STRYBLDR_CAMERA_SPHERE_GRID_OPACITY.activeLatitude : STRYBLDR_CAMERA_SPHERE_GRID_OPACITY.latitude}
              data-kg-strybldr-camera-grid-row={row.key}
              data-kg-strybldr-camera-grid-latitude={row.degree}
              data-kg-strybldr-camera-grid-active={active ? '1' : undefined}
            />
          )
        })}
        <line x1="140" y1="38" x2="140" y2="202" opacity={STRYBLDR_CAMERA_SPHERE_GRID_OPACITY.axis} data-kg-strybldr-camera-grid-axis="vertical" />
        {STRYBLDR_CAMERA_SPHERE_LONGITUDE_DEGREES.map(longitude => {
          const meridian = resolveCameraOrbitSphereGridMeridianGeometry(STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG, longitude)
          return meridian.kind === 'line' ? (
            <line
              key={longitude}
              x1={meridian.x}
              y1="38"
              x2={meridian.x}
              y2="202"
              opacity={STRYBLDR_CAMERA_SPHERE_GRID_OPACITY.axis}
              data-kg-strybldr-camera-grid-longitude={longitude}
            />
          ) : (
            <path
              key={longitude}
              d={meridian.pathD}
              opacity={STRYBLDR_CAMERA_SPHERE_GRID_OPACITY.longitude}
              strokeLinecap="round"
              data-kg-strybldr-camera-grid-longitude={longitude}
            />
          )
        })}
      </g>
      <g fill="none" stroke="#767973" strokeWidth="1.15">
        <ellipse
          cx="140"
          cy={activeLatitudeGeometry.cy}
          rx={activeLatitudeGeometry.rx}
          ry={activeLatitudeGeometry.ry}
          opacity={STRYBLDR_CAMERA_SPHERE_ACTIVE_STROKE_OPACITY}
          data-kg-strybldr-camera-grid-active-overlay={activeLatitudeGeometry.key}
          data-kg-strybldr-camera-grid-active-latitude={activeLatitudeGeometry.degree}
        />
      </g>
      {previewImageUrl ? (
        <image
          href={previewImageUrl}
          xlinkHref={previewImageUrl}
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
          preserveAspectRatio="xMidYMid slice"
          data-kg-strybldr-camera-shot-frame={shot}
        />
      ) : (
        <>
          <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="rgba(255,255,255,0.78)" data-kg-strybldr-camera-shot-frame={shot} />
          <path d="M119 111 L130 122 L139 112 L155 129" fill="none" stroke="rgba(18,18,18,0.18)" strokeWidth="1.1" />
          <path d="M150 104 L168.75 113 L168.75 136.17 L150 127 Z" fill="rgba(20,184,166,0.38)" stroke="rgba(20,184,166,0.35)" strokeWidth="1" />
        </>
      )}
      <polygon
        points={`${pose.cameraX.toFixed(1)},${pose.cameraY.toFixed(1)} ${pose.rayEdgeEndX.toFixed(1)},${pose.rayEdgeEndY.toFixed(1)} ${pose.rayEdgeStartX.toFixed(1)},${pose.rayEdgeStartY.toFixed(1)}`}
        fill={`url(#${rayId})`}
      />
      <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="none" stroke="#121212" strokeOpacity="0.18" strokeWidth="1" />
      <g fill="none" stroke="#767973" strokeWidth="1.15">
        {activeMeridianGeometry.kind === 'line' ? (
          <line
            x1={activeMeridianGeometry.x}
            y1="38"
            x2={activeMeridianGeometry.x}
            y2="202"
            opacity={STRYBLDR_CAMERA_SPHERE_ACTIVE_MERIDIAN_OPACITY}
            data-kg-strybldr-camera-grid-active-meridian={activeMeridianGeometry.longitude}
          />
        ) : (
          <path
            d={activeMeridianGeometry.pathD}
            opacity={STRYBLDR_CAMERA_SPHERE_ACTIVE_MERIDIAN_OPACITY}
            strokeLinecap="round"
            data-kg-strybldr-camera-grid-active-meridian={activeMeridianGeometry.longitude}
          />
        )}
      </g>
      <g
        transform={`translate(${pose.cameraX.toFixed(1)}, ${pose.cameraY.toFixed(1)}) rotate(${pose.rotation.toFixed(1)})`}
        opacity="1"
        data-kg-strybldr-camera-handle="1"
      >
        <g>
          <rect
            x={STRYBLDR_CAMERA_HANDLE_BODY_RECT.x}
            y={STRYBLDR_CAMERA_HANDLE_BODY_RECT.y}
            width={STRYBLDR_CAMERA_HANDLE_BODY_RECT.width}
            height={STRYBLDR_CAMERA_HANDLE_BODY_RECT.height}
            rx={STRYBLDR_CAMERA_HANDLE_BODY_RECT.radius}
            fill="#1f1f1f"
            data-kg-strybldr-camera-handle-body="1"
          />
          <rect
            x={STRYBLDR_CAMERA_HANDLE_LENS_RECT.x}
            y={STRYBLDR_CAMERA_HANDLE_LENS_RECT.y}
            width={STRYBLDR_CAMERA_HANDLE_LENS_RECT.width}
            height={STRYBLDR_CAMERA_HANDLE_LENS_RECT.height}
            rx={STRYBLDR_CAMERA_HANDLE_LENS_RECT.radius}
            fill="#1f1f1f"
            data-kg-strybldr-camera-handle-lens="1"
          />
        </g>
      </g>
    </svg>
  )
}

export function StrybldrCameraPanel({
  selectedCardTitle,
  settings,
  previewImageUrl,
  onSettingsChange,
  onReframe,
}: StrybldrCameraPanelProps) {
  const previewRef = React.useRef<HTMLElement | null>(null)
  const dragOffsetRef = React.useRef({ x: 0, y: 0 })
  const [draggingCamera, setDraggingCamera] = React.useState(false)

  const setSettingsFromPreviewPoint = React.useCallback((clientX: number, clientY: number, offset = dragOffsetRef.current) => {
    const preview = previewRef.current
    if (!preview) return
    const point = resolveCameraOrbitPreviewSvgPoint(preview, clientX, clientY, STRYBLDR_CAMERA_PREVIEW_VIEWBOX)
    const frame = STRYBLDR_CAMERA_SHOT_FRAMES[settings.shot]
    const gridPoint = resolveCameraOrbitSphereGridPointFromRenderedPoint(STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG, { x: point.x - offset.x, y: point.y - offset.y }, frame, STRYBLDR_CAMERA_FRAME_AWARE_OPTIONS)
    const gridOrbit = resolveCameraOrbitSphereOrbitFromGridPoint(STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG, gridPoint)
    const orbit = resolveStrybldrCameraOrbit(gridOrbit.orbitX, gridOrbit.orbitY)
    onSettingsChange({ ...settings, ...orbit })
  }, [onSettingsChange, settings])

  return (
    <section
      className={cn('space-y-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.headerBg)}
      aria-label="Strybldr camera"
      data-kg-strybldr-camera-panel="1"
    >
      <section className="flex min-w-0 items-center justify-between gap-2">
        <section className="flex min-w-0 items-center gap-2">
          <Camera className="h-4 w-4 shrink-0" aria-hidden={true} />
          <section className="min-w-0 text-xs font-semibold">Camera</section>
        </section>
        <section className={cn('min-w-0 truncate text-xs font-semibold uppercase tracking-normal', UI_THEME_TOKENS.text.tertiary)}>
          {getStrybldrCameraLabel(settings.angle)} · {getStrybldrCameraLabel(settings.level)}
        </section>
      </section>

      <section className="space-y-2" aria-label="Strybldr camera preview">
        <section
          ref={previewRef}
          className={cn(
            'relative aspect-[7/6] touch-none overflow-hidden rounded-[8px] border border-black/10 bg-white/70',
            draggingCamera ? 'cursor-grabbing' : 'cursor-grab',
          )}
          aria-label="Strybldr camera orbit sphere"
          role="application"
          onPointerDown={event => {
            const point = resolveCameraOrbitPreviewSvgPoint(event.currentTarget, event.clientX, event.clientY, STRYBLDR_CAMERA_PREVIEW_VIEWBOX)
            if (!isPointOnStrybldrCameraHandle(point, settings)) return
            const pose = resolveStrybldrCameraSpherePose(settings.orbitX, settings.orbitY, STRYBLDR_CAMERA_SHOT_FRAMES[settings.shot])
            dragOffsetRef.current = { x: point.x - pose.cameraX, y: point.y - pose.cameraY }
            event.currentTarget.setPointerCapture(event.pointerId)
            setDraggingCamera(true)
          }}
          onPointerMove={event => {
            if (!draggingCamera) return
            setSettingsFromPreviewPoint(event.clientX, event.clientY)
          }}
          onPointerUp={event => {
            if (draggingCamera) setSettingsFromPreviewPoint(event.clientX, event.clientY)
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            dragOffsetRef.current = { x: 0, y: 0 }
            setDraggingCamera(false)
          }}
          onPointerCancel={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            dragOffsetRef.current = { x: 0, y: 0 }
            setDraggingCamera(false)
          }}
        >
          <StrybldrCameraSphereGraphic orbitX={settings.orbitX} orbitY={settings.orbitY} shot={settings.shot} previewImageUrl={previewImageUrl} />
        </section>
      </section>

      <CameraSegmentedControl
        ariaLabel="Strybldr camera angle"
        value={settings.angle}
        options={STRYBLDR_CAMERA_ANGLES}
        onChange={angle => {
          const gridOrbit = resolveStrybldrCameraControlOrbit(angle, settings.level)
          const orbit = resolveStrybldrCameraOrbit(gridOrbit.orbitX, gridOrbit.orbitY)
          onSettingsChange({ ...settings, angle, level: orbit.level, orbitX: orbit.orbitX, orbitY: orbit.orbitY })
        }}
      />
      <CameraSegmentedControl
        ariaLabel="Strybldr camera level"
        value={settings.level}
        options={STRYBLDR_CAMERA_LEVELS}
        onChange={level => {
          const gridOrbit = resolveStrybldrCameraControlOrbit(settings.angle, level)
          const orbit = resolveStrybldrCameraOrbit(gridOrbit.orbitX, gridOrbit.orbitY)
          onSettingsChange({ ...settings, angle: orbit.angle, level, orbitX: orbit.orbitX, orbitY: orbit.orbitY })
        }}
      />
      <CameraSegmentedControl
        ariaLabel="Strybldr camera shot size"
        value={settings.shot}
        options={STRYBLDR_CAMERA_SHOTS}
        onChange={shot => onSettingsChange({ ...settings, shot })}
      />

      <StrybldrCameraOpticsSection settings={settings} onSettingsChange={onSettingsChange} />

      <PanelField label="Note">
        <PanelTextarea
          className="mt-1 min-h-16"
          value={settings.note}
          aria-label="Strybldr camera note"
          placeholder="Add a note (optional)"
          onChange={event => onSettingsChange({ ...settings, note: event.target.value })}
        />
      </PanelField>
      <button
        type="button"
        className={cn(
          UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME,
          'inline-flex w-full items-center justify-center gap-1 rounded border text-xs font-semibold',
          UI_THEME_TOKENS.panel.border,
          UI_THEME_TOKENS.button.hoverBg,
          UI_THEME_TOKENS.text.primary,
        )}
        title={`Reframe ${selectedCardTitle}`}
        onClick={() => onReframe({ ...settings, note: settings.note.trim() })}
      >
        <Layers className="h-3.5 w-3.5" aria-hidden={true} />
        Reframe
      </button>
      <section className={cn('sr-only')} aria-live="polite">
        {formatStrybldrCameraSettings(settings)}. Drag camera around the sphere to reframe.
      </section>
    </section>
  )
}
