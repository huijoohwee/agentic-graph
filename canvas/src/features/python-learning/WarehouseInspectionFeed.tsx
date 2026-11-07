import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { useId, useMemo, useState, useSyncExternalStore } from 'react'
import { readMotionControlSnapshot, subscribeMotionControl } from '@/features/three/motionControlRuntime'
import { WAREHOUSE_INSPECTION_FPS, type WarehouseInspectionSample } from './warehouseCoverageRoutes'
import {
  sampleWarehouseCameraFrame, WAREHOUSE_CAMERA_IDS, WAREHOUSE_CAMERAS as cameras,
  WAREHOUSE_INFERENCE_MS, type WarehouseCameraId, type DetectionFixture,
} from './warehouseCameraFrames'

const actionClass = `${UI_THEME_TOKENS.control.singleLine} ${UI_THEME_TOKENS.border.outline} rounded text-xs`

function RackFrame({ id, view, detections }: { id: string; view: string; detections: readonly DetectionFixture[] }) {
  return <>
    <defs>
      <linearGradient id={`${id}-floor`} x2="0" y2="1"><stop stopColor="#c7d2d7" /><stop offset="1" stopColor="#667f8d" /></linearGradient>
      <linearGradient id={`${id}-light`} x2="0" y2="1"><stop stopColor="#dde9eb" /><stop offset="1" stopColor="#a2b6c0" /></linearGradient>
    </defs>
    <rect width="640" height="360" fill={`url(#${id}-light)`} />
    <path d="M0 95 L320 155 L640 95 V360 H0Z" fill={`url(#${id}-floor)`} />
    {view === 'overview' ? <>
      <path d="M35 102 H605 V300 H35Z" fill="#b8c4c9" stroke="#576e7b" strokeWidth="5" />
      {[0, 1, 2, 3].map(row => <g key={row} transform={`translate(${285 + row * 65} 110)`}>
        <rect width="35" height="130" fill="#426c83" />
        {[0, 1, 2, 3].map(shelf => <rect key={shelf} y={10 + shelf * 30} width="35" height="20" fill="#b58960" stroke="#dd883f" strokeWidth="4" />)}
      </g>)}
      <path d="M55 275 H595 M210 110 V300" stroke="#e7c366" strokeWidth="3" strokeDasharray="10 8" />
      <text x="55" y="130" fill="#263f50" fontSize="14">Receiving</text>
    </> : view === 'dock' ? <>
      <path d="M160 290 L225 160 H440 L505 290Z" fill="#263b49" stroke="#122833" strokeWidth="5" />
      <path d="M210 268 L251 185 H408 L455 268Z" fill="#586f78" stroke="#9fbbc1" strokeWidth="4" />
      <path d="M146 290 L193 182 M481 182 L519 290" stroke="#182832" strokeWidth="24" />
      <path d="M220 163 L190 94 H299 L311 163 M340 163 L355 94 H464 L433 163" fill="#334b58" stroke="#8da5ad" strokeWidth="3" />
      <text x="320" y="130" textAnchor="middle" fill="#ecf5f8" fontSize="14">Mobile charging bay</text>
    </> : <>
      <path d="M0 40 L260 130 V260 L0 342Z" fill="#284d66" />
      <path d="M640 40 L380 130 V260 L640 342Z" fill="#284d66" />
      {[0, 1, 2, 3].map(tier => <g key={tier}>
        <path d={`M0 ${65 + tier * 77} L260 ${140 + tier * 34} M640 ${65 + tier * 77} L380 ${140 + tier * 34}`} fill="none" stroke="#d68037" strokeWidth="8" />
        {[0, 1, 2].map(bay => <g key={bay}>
          <path d={`M${20 + bay * 75} ${55 + tier * 65} h48 v35 h-48Z`} fill={tier % 2 ? '#bc946c' : '#cfab80'} stroke="#987553" strokeWidth="2" />
          <path d={`M${572 - bay * 75} ${55 + tier * 65} h48 v35 h-48Z`} fill={tier % 2 ? '#c09a74' : '#d0ac80'} stroke="#987553" strokeWidth="2" />
        </g>)}
      </g>)}
      {[0, 1, 2].map(bay => <g key={bay} stroke="#267295" strokeWidth="9">
        <path d={`M${10 + bay * 85} ${45 + bay * 27} V${345 - bay * 38}`} />
        <path d={`M${630 - bay * 85} ${45 + bay * 27} V${345 - bay * 38}`} />
      </g>)}
      <path d="M270 360 L304 186 M370 360 L336 186" stroke="#e6c96c" strokeWidth="3" />
      <path d="M265 120 H375 V195 H265Z" fill="#cbdfe6" stroke="#80969f" strokeWidth="4" />
      <path d="M295 30 H345 M285 65 H355 M275 100 H365" stroke="#f8fbff" strokeWidth="5" />
    </>}
    {detections.map(item => <g key={item.id}>
      <rect x={item.box.x * 640} y={item.box.y * 360} width={item.box.width * 640} height={item.box.height * 360}
        rx="2" fill={item.label.includes('marker') ? '#e5d8a4' : item.label.includes('Drone') ? '#e9f2f3' : item.label.includes('Charging') ? '#2e8998' : '#bb956e'}
        stroke="#506573" strokeWidth="2" />
      {item.label.includes('Pallet') && <path d={`M${item.box.x * 640 + 5} ${(item.box.y + item.box.height) * 360 - 9} h${item.box.width * 640 - 10}`} stroke="#70553e" strokeWidth="6" />}
      {item.label.includes('marker') && <text x={(item.box.x + item.box.width / 2) * 640} y={(item.box.y + item.box.height / 2) * 360 + 4} textAnchor="middle" fontSize="12" fill="#293b49">REF</text>}
    </g>)}
  </>
}

export function WarehouseInspectionFeed({ seconds, sample }: { seconds: number; sample: WarehouseInspectionSample }) {
  const [cameraId, setCameraId] = useState<WarehouseCameraId>('drone001')
  const [opening, setOpening] = useState(false)
  const [notice, setNotice] = useState('')
  const boundsEnabled = useSyncExternalStore(subscribeMotionControl, () => readMotionControlSnapshot().boundingBoxEnabled, () => false)
  const frame = useMemo(() => sampleWarehouseCameraFrame(cameraId, seconds), [cameraId, seconds])
  const id = useId().replace(/:/g, '')
  const openMotionControl = async () => {
    setOpening(true)
    try {
      const { controlLocalMotionControl } = await import('@/features/three/motionControlMcpRuntime')
      const result = await controlLocalMotionControl({ operation: 'open' })
      setNotice(result.message)
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
    finally { setOpening(false) }
  }
  return <section className={`min-w-0 space-y-2 overflow-hidden rounded p-2 text-xs ${UI_THEME_TOKENS.border.outline}`} aria-label="Simulated warehouse video pipeline">
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <strong className="min-w-0 truncate" title="Camera → Wi-Fi → cloud detector · simulation">Camera → Wi-Fi → cloud detector · simulation</strong>
      <button type="button" className={actionClass} disabled={opening} onClick={() => void openMotionControl()}>Open Motion Control</button>
    </header>
    <svg className="max-h-40 w-full rounded bg-slate-900" viewBox="0 0 640 360" role="img" aria-label={`${cameras[cameraId].label} synthetic camera frame${frame.frameIndex >= 0 ? ` ${frame.frameIndex}` : ' awaiting delivery'}`}
      data-warehouse-camera={cameraId} data-warehouse-camera-frame={frame.frameId ?? 'pending'} data-warehouse-bounds={boundsEnabled ? 'enabled' : 'disabled'}>
      <RackFrame id={id} view={frame.view} detections={frame.detections} />
      {boundsEnabled && frame.detections.map(item => <g key={item.id} data-warehouse-detection={item.id} data-warehouse-detection-frame={frame.frameId ?? undefined}>
        <rect x={item.box.x * 640} y={item.box.y * 360} width={item.box.width * 640} height={item.box.height * 360} fill="none" stroke="#6cffa6" strokeWidth="2.5" />
        <rect x={item.box.x * 640} y={item.box.y * 360 - 19} width={Math.min(170, 640 - item.box.x * 640)} height="18" fill="#112f26" fillOpacity=".94" />
        <text x={item.box.x * 640 + 4} y={item.box.y * 360 - 6} fill="#b6ffd0" fontSize="11">{item.label} · {(item.confidence * 100).toFixed(0)}% fixture</text>
      </g>)}
      <rect width="640" height="27" fill="#12232e" fillOpacity=".86" />
      <text x="10" y="18" fill="#e5f4f8" fontSize="12">SIMULATED · {cameras[cameraId].label} · {frame.frameIndex < 0 ? 'waiting for first frame' : `frame ${frame.frameIndex} · ${frame.capturedSeconds.toFixed(2)} s`}</text>
      <rect y="334" width="640" height="26" fill="#12232e" fillOpacity=".86" />
      <text x="10" y="351" fill="#e5f4f8" fontSize="11">{frame.target} · {boundsEnabled ? 'Bounds enabled by Motion Control' : 'Bounds disabled by Motion Control'}</text>
    </svg>
    <fieldset aria-label="Simulated camera source" className="m-0 flex min-w-0 flex-wrap gap-1 border-0 p-0">
      {WAREHOUSE_CAMERA_IDS.map(value => <button key={value} type="button" className={actionClass} aria-pressed={cameraId === value} onClick={() => setCameraId(value)}>{cameras[value].label}</button>)}
    </fieldset>
    <section className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,100px),1fr))] gap-1" aria-label="Simulated pipeline stages">
      <section className={`min-w-0 rounded p-2 ${UI_THEME_TOKENS.border.outline}`}><strong>Camera</strong><p>Frame {frame.captureIndex} · {WAREHOUSE_INSPECTION_FPS} fps</p></section>
      <section className={`min-w-0 rounded p-2 ${UI_THEME_TOKENS.border.outline}`}><strong>Wi-Fi</strong><p>{frame.wifiIndex < 0 ? 'Pending' : `Frame ${frame.wifiIndex}`} · {cameras[cameraId].wifiMs} ms modeled</p></section>
      <section className={`min-w-0 rounded p-2 ${UI_THEME_TOKENS.border.outline}`}><strong>Cloud YOLO</strong><p>{frame.frameIndex < 0 ? 'Pending' : `Frame ${frame.frameIndex}`} · {WAREHOUSE_INFERENCE_MS} ms modeled</p></section>
    </section>
    <p>Illustrated synthetic frames and detection fixtures. No Wi-Fi connection, upload or YOLO inference. Displayed bounds belong to the displayed frame; scrubbing recomputes both.</p>
    <p>{sample.drone002Docked ? 'Drone 002 docked' : 'Drone 002 deployed'} · {sample.charging ? 'charging simulation' : 'charging idle'} · lid {(sample.lidAngleRadians * 180 / Math.PI).toFixed(0)}°</p>
    {notice && <p role="status">{notice}</p>}
  </section>
}
