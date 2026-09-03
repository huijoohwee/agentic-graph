import React from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { StandaloneSpatialCaptureManifest } from '@/features/markdown-workspace/workspaceImport/spatialCaptureFileset'
import {
  readSpatialCaptureCenterAction,
  readSpatialCaptureTool,
  subscribeSpatialCaptureCenterAction,
  subscribeSpatialCaptureTool,
} from '@/features/three/xrSpatialCaptureTools'
import type { SpatialCaptureCenterActionId, SpatialCaptureToolId } from '@/features/three/xrSpatialCaptureTools'
import {
  readXrArPlacementRuntime,
  subscribeXrArPlacementRuntime,
} from '@/features/three/xrArPlacementRuntime'
import { loadSpatialCapturePointCloud, loadSpatialCapturePointCloudPreview, type SpatialCapturePointCloudLoad } from '@/lib/assets/spatialCaptureAssetRuntime'
import type { GlbFit } from '@/lib/three/GlbAssetModel'
import {
  DEFAULT_GAUSSIAN_SPLAT_EDIT_SETTINGS,
  resolveGaussianSplatCropBounds,
  resolveGaussianSplatScaleCeiling,
  resolveGaussianSplatVisibleIndices,
} from './gaussianSplatEditorModel'
import {
  hydrateGaussianSplatEditorRuntime,
  readGaussianSplatEditorRuntime,
  subscribeGaussianSplatEditorRuntime,
} from './gaussianSplatEditorRuntime'
import {
  SPATIAL_CAPTURE_INITIAL_VIEW_DIRECTION,
  SPATIAL_CAPTURE_PROGRESSIVE_INTERVAL_MS,
  SPATIAL_CAPTURE_SORT_DIRECTION_DOT_MIN,
  SPATIAL_CAPTURE_SORT_INTERVAL_MS,
  SPATIAL_CAPTURE_SORT_SETTLE_MS,
  advanceSpatialCaptureProgressiveCount,
  buildGaussianSplatGeometry,
  buildPointCloudGeometry,
  dotSortDirection,
  readSpatialCaptureGeometryCount,
  resolveCameraSortDirection,
  updateGaussianSplatEditorVisibility,
  updateGaussianSplatGeometrySort,
} from './spatialCaptureGeometryRuntime'
import { buildGaussianSplatMaterial } from './spatialCaptureGaussianMaterial'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; load: SpatialCapturePointCloudLoad }
  | { status: 'empty' }
  | { status: 'error'; message: string }

const STAGE_TARGET_EXTENT = 156
const SPATIAL_CAPTURE_BACKGROUND = '#081827'
const SPATIAL_CAPTURE_FOG = '#0d2236'
const SPATIAL_CAPTURE_GRID_MAJOR = '#b9c8d8'
const SPATIAL_CAPTURE_GRID_MINOR = '#31506b'
const SPATIAL_CAPTURE_FULL_PROMOTION_DELAY_MS = 180
const SPATIAL_CAPTURE_SELECTION_COLORS: Record<SpatialCaptureCenterActionId, string> = {
  set: '#e2e8f0',
  add: '#38bdf8',
  remove: '#fb7185',
}
const readImmersiveSessionMode = () => readXrArPlacementRuntime().immersiveSessionMode

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function buildSpatialCaptureFit(load: SpatialCapturePointCloudLoad): GlbFit {
  const bounds = load.pointCloud.bounds
  const sourceAnchored = load.pointCloud.kind === 'gaussian-splat'
  const size: [number, number, number] = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ]
  const scale = STAGE_TARGET_EXTENT / Math.max(1, bounds.maxExtent)
  const scaledSize: [number, number, number] = [
    size[0] * scale,
    size[1] * scale,
    size[2] * scale,
  ]
  const stageSpan = clamp(Math.max(scaledSize[0], scaledSize[2], STAGE_TARGET_EXTENT) * 1.6, 180, 520)
  return {
    cameraProfile: 'spatial-capture',
    cameraTarget: [0, 0, 0],
    position: sourceAnchored
      ? [0, 0, 0]
      : [
        -bounds.center[0] * scale,
        -bounds.center[1] * scale,
        -bounds.center[2] * scale,
    ],
    scale,
    floorY: sourceAnchored ? bounds.min[1] * scale : (bounds.min[1] - bounds.center[1]) * scale,
    stageSpan,
    preserveFlatFacing: false,
    flatAxis: null,
    size,
    scaledSize,
  }
}

function resolvePointCloudMaterialScale(pointCount: number): number {
  const millions = Math.max(0.25, pointCount / 1_000_000)
  return Math.max(2.4, Math.min(6.2, 7.6 / Math.sqrt(millions)))
}

function waitForSpatialCapturePreviewFirstPaint(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window === 'undefined') {
      setTimeout(resolve, SPATIAL_CAPTURE_FULL_PROMOTION_DELAY_MS)
      return
    }
    const finish = () => window.setTimeout(resolve, SPATIAL_CAPTURE_FULL_PROMOTION_DELAY_MS)
    if (typeof window.requestAnimationFrame !== 'function') {
      finish()
      return
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish))
  })
}

function buildPointCloudMaterial(args: {
  hasColor: boolean
  dimmed: boolean
  pointCount: number
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    defines: args.hasColor ? { AG_HAS_POINT_COLOR: '1' } : undefined,
    uniforms: {
      baseColor: { value: new THREE.Color('#dbeafe') },
      opacityScale: { value: resolveSpatialCaptureOpacityScale('point-cloud', args.dimmed) },
      pointScale: { value: resolvePointCloudMaterialScale(args.pointCount) },
    },
    vertexShader: `
      precision highp float;
      uniform float pointScale;
      #ifdef AG_HAS_POINT_COLOR
      attribute vec3 pointColor;
      varying vec3 vPointColor;
      #endif
      void main() {
        #ifdef AG_HAS_POINT_COLOR
        vPointColor = pointColor;
        #endif
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float attenuation = 160.0 / max(1.0, -mvPosition.z);
        gl_PointSize = clamp(pointScale * attenuation, 1.35, 9.5);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 baseColor;
      uniform float opacityScale;
      #ifdef AG_HAS_POINT_COLOR
      varying vec3 vPointColor;
      #endif
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float radius = dot(uv, uv);
        if (radius > 0.25) discard;
        float core = exp(-radius * 7.0);
        float alpha = smoothstep(0.0, 0.92, core) * opacityScale;
        #ifdef AG_HAS_POINT_COLOR
        vec3 color = vPointColor;
        #else
        vec3 color = baseColor;
        #endif
        gl_FragColor = vec4(color, alpha);
      }
    `,
  })
}

export function resolveSpatialCaptureOpacityScale(
  kind: 'point-cloud' | 'gaussian-splat',
  dimmed: boolean,
): number {
  if (kind === 'gaussian-splat') return dimmed ? 0.42 : 1
  return dimmed ? 0.66 : 0.96
}

function SpatialCaptureStatusMarker({ color }: { color: string }) {
  return (
    <group name="agentic_os_spatial_capture_status_marker">
      <gridHelper args={[96, 12, '#475569', '#1f2937']} position={[0, -18, 0]} />
      <mesh position={[0, -18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[23, 24, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.48} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

function resolveSelectionRadius(load: SpatialCapturePointCloudLoad): number {
  return Math.max(12, Math.min(180, load.pointCloud.bounds.maxExtent * 0.42))
}

function resolveSelectionScale(load: SpatialCapturePointCloudLoad): [number, number, number] {
  const bounds = load.pointCloud.bounds
  const radius = resolveSelectionRadius(load)
  const sizeX = Math.max(1, bounds.max[0] - bounds.min[0])
  const sizeY = Math.max(1, bounds.max[1] - bounds.min[1])
  const sizeZ = Math.max(1, bounds.max[2] - bounds.min[2])
  return [
    Math.max(radius * 0.45, sizeX * 0.36),
    Math.max(radius * 0.45, sizeY * 0.5),
    Math.max(radius * 0.45, sizeZ * 0.36),
  ]
}

function SpatialCaptureSelectionOverlay({
  action,
  load,
  tool,
}: {
  action: SpatialCaptureCenterActionId
  load: SpatialCapturePointCloudLoad
  tool: SpatialCaptureToolId
}) {
  const color = SPATIAL_CAPTURE_SELECTION_COLORS[action]
  const radius = resolveSelectionRadius(load)
  const boxScale = resolveSelectionScale(load)
  if (tool === 'sphere') {
    return (
      <group name="agentic_os_spatial_capture_sphere_select_volume">
        <mesh renderOrder={8}>
          <sphereGeometry args={[radius, 48, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.08} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {[
          [0, 0, 0],
          [Math.PI / 2, 0, 0],
          [0, Math.PI / 2, 0],
        ].map((rotation, index) => (
          <mesh key={index} rotation={rotation as [number, number, number]} renderOrder={9}>
            <ringGeometry args={[radius * 0.994, radius, 144]} />
            <meshBasicMaterial color={color} transparent opacity={0.82} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
        <axesHelper args={[Math.max(18, radius * 0.22)]} />
      </group>
    )
  }
  if (tool === 'box') {
    return (
      <group name="agentic_os_spatial_capture_box_select_volume">
        <mesh scale={boxScale} renderOrder={8}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={color} transparent opacity={0.07} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh scale={boxScale} renderOrder={9}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.82} depthWrite={false} />
        </mesh>
      </group>
    )
  }
  if (tool === 'center') {
    return (
      <group name="agentic_os_spatial_capture_center_select_crosshair">
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={9}>
          <ringGeometry args={[radius * 0.12, radius * 0.135, 96]} />
          <meshBasicMaterial color={color} transparent opacity={0.72} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <axesHelper args={[Math.max(18, radius * 0.28)]} />
      </group>
    )
  }
  return null
}

export function SpatialCaptureManifestStage({
  manifest,
  paused,
  dimmed = paused,
  onLoadStateChange,
  onFitChange,
}: {
  manifest: StandaloneSpatialCaptureManifest
  paused: boolean
  dimmed?: boolean
  onLoadStateChange?: (state: LoadState) => void
  onFitChange?: (fit: GlbFit | null) => void
}) {
  const { camera, scene, size } = useThree()
  const immersiveSessionMode = React.useSyncExternalStore(
    subscribeXrArPlacementRuntime,
    readImmersiveSessionMode,
    readImmersiveSessionMode,
  )
  const [state, setState] = React.useState<LoadState>({ status: 'loading' })
  const [spatialTool, setSpatialTool] = React.useState<SpatialCaptureToolId>(readSpatialCaptureTool())
  const [spatialCenterAction, setSpatialCenterAction] = React.useState<SpatialCaptureCenterActionId>(readSpatialCaptureCenterAction())
  const sortStateRef = React.useRef<{
    direction: readonly [number, number, number]
    lastProgressiveMs: number
    lastSortMs: number
    pendingDirection: readonly [number, number, number] | null
    pendingSinceMs: number
  }>({
    direction: SPATIAL_CAPTURE_INITIAL_VIEW_DIRECTION,
    lastProgressiveMs: 0,
    lastSortMs: 0,
    pendingDirection: null,
    pendingSinceMs: 0,
  })
  const loadKey = [
    manifest.format,
    manifest.renderCacheKey,
    manifest.pendingLocalPath,
    manifest.sourceKind,
    manifest.sourceIdentity,
  ].join('|')
  const editorRuntime = React.useSyncExternalStore(
    subscribeGaussianSplatEditorRuntime,
    readGaussianSplatEditorRuntime,
    readGaussianSplatEditorRuntime,
  )
  const editorSettings = editorRuntime.sceneKey === loadKey
    ? editorRuntime.settings
    : DEFAULT_GAUSSIAN_SPLAT_EDIT_SETTINGS

  React.useEffect(() => subscribeSpatialCaptureTool(setSpatialTool), [])
  React.useEffect(() => subscribeSpatialCaptureCenterAction(setSpatialCenterAction), [])

  React.useEffect(() => {
    let cancelled = false
    const loadingState: LoadState = { status: 'loading' }
    setState(loadingState)
    onLoadStateChange?.(loadingState)
    hydrateGaussianSplatEditorRuntime({ sceneKey: loadKey, load: null, status: 'loading' })
    const promoteLoad = (load: SpatialCapturePointCloudLoad | null) => {
      if (cancelled) return
      const nextState: LoadState = load ? { status: 'ready', load } : { status: 'empty' }
      setState(nextState)
      onLoadStateChange?.(nextState)
      hydrateGaussianSplatEditorRuntime({ sceneKey: loadKey, load, status: load ? 'ready' : 'empty' })
    }
    loadSpatialCapturePointCloudPreview(manifest)
      .then(async previewLoad => {
        if (cancelled) return
        if (previewLoad) {
          promoteLoad(previewLoad)
          if (previewLoad.pointCloud.pointCount >= previewLoad.pointCloud.sourcePointCount) return
          await waitForSpatialCapturePreviewFirstPaint()
          if (cancelled) return
        }
        promoteLoad(await loadSpatialCapturePointCloud(manifest))
      })
      .catch(error => {
        if (cancelled) return
        loadSpatialCapturePointCloud(manifest)
          .then(promoteLoad)
          .catch(fullError => {
            if (cancelled) return
            const nextState: LoadState = { status: 'error', message: fullError instanceof Error ? fullError.message : String(fullError || error) }
            setState(nextState)
            onLoadStateChange?.(nextState)
            hydrateGaussianSplatEditorRuntime({ sceneKey: loadKey, load: null, status: 'error' })
          })
      })
    return () => {
      cancelled = true
    }
  }, [loadKey, manifest, onLoadStateChange])

  const fit = React.useMemo(() => (state.status === 'ready' ? buildSpatialCaptureFit(state.load) : null), [state])
  const geometry = React.useMemo(() => {
    if (state.status !== 'ready' || !fit) return null
    return state.load.pointCloud.kind === 'gaussian-splat'
      ? buildGaussianSplatGeometry(state.load)
      : buildPointCloudGeometry(state.load)
  }, [fit, state])
  React.useEffect(() => () => geometry?.dispose(), [geometry])
  const gaussianEditorVisibility = React.useMemo(() => {
    if (state.status !== 'ready' || state.load.pointCloud.kind !== 'gaussian-splat') return null
    const pointCloud = state.load.pointCloud
    const visibility = new Float32Array(pointCloud.pointCount)
    for (const index of resolveGaussianSplatVisibleIndices(pointCloud, editorSettings)) visibility[index] = 1
    return visibility
  }, [editorSettings, state])
  React.useEffect(() => {
    if (!(geometry instanceof THREE.InstancedBufferGeometry) || !gaussianEditorVisibility) return
    updateGaussianSplatEditorVisibility(geometry, gaussianEditorVisibility)
  }, [gaussianEditorVisibility, geometry])
  const gaussianSplatMaterial = React.useMemo(() => {
    if (
      state.status !== 'ready'
      || state.load.pointCloud.kind !== 'gaussian-splat'
      || !state.load.pointCloud.colors
      || !state.load.pointCloud.opacities
      || !state.load.pointCloud.splatScales
      || !state.load.pointCloud.splatRotations
    ) return null
    return buildGaussianSplatMaterial({
      paused: false,
      viewportHeight: size.height,
      viewportWidth: size.width,
    })
  }, [size.height, size.width, state])
  React.useEffect(() => {
    if (!gaussianSplatMaterial || state.status !== 'ready') return
    const crop = resolveGaussianSplatCropBounds(state.load.pointCloud, editorSettings)
    const scaleCeiling = resolveGaussianSplatScaleCeiling(state.load.pointCloud, editorSettings)
    gaussianSplatMaterial.uniforms.opacityScale.value = resolveSpatialCaptureOpacityScale('gaussian-splat', dimmed)
    gaussianSplatMaterial.uniforms.viewportSize.value.set(Math.max(1, size.width), Math.max(1, size.height))
    gaussianSplatMaterial.uniforms.editorVisualization.value = editorSettings.visualization === 'centers' ? 1 : editorSettings.visualization === 'rings' ? 2 : 0
    gaussianSplatMaterial.uniforms.editorOpacityFloor.value = editorSettings.opacityFloor
    gaussianSplatMaterial.uniforms.editorScaleCeiling.value = scaleCeiling > 0 ? scaleCeiling : 1e20
    gaussianSplatMaterial.uniforms.editorCropMin.value.set(...crop.min)
    gaussianSplatMaterial.uniforms.editorCropMax.value.set(...crop.max)
    gaussianSplatMaterial.uniforms.editorBrightness.value = editorSettings.brightness
    gaussianSplatMaterial.uniforms.editorSaturation.value = editorSettings.saturation
  }, [dimmed, editorSettings, gaussianSplatMaterial, size.height, size.width, state])
  React.useEffect(() => () => gaussianSplatMaterial?.dispose(), [gaussianSplatMaterial])
  useFrame(({ clock }) => {
    if (
      state.status !== 'ready'
      || !geometry
    ) return
    const elapsedMs = clock.elapsedTime * 1000
    const sortState = sortStateRef.current
    if (!paused && elapsedMs - sortState.lastProgressiveMs >= SPATIAL_CAPTURE_PROGRESSIVE_INTERVAL_MS) {
      advanceSpatialCaptureProgressiveCount(geometry, state.load)
      sortState.lastProgressiveMs = elapsedMs
    }
    if (
      state.load.pointCloud.kind !== 'gaussian-splat'
      || paused
      || !(geometry instanceof THREE.InstancedBufferGeometry)
      || readSpatialCaptureGeometryCount(geometry, state.load) < state.load.pointCloud.pointCount
    ) return
    const nextDirection = resolveCameraSortDirection(camera)
    if (
      dotSortDirection(sortState.direction, nextDirection) >= SPATIAL_CAPTURE_SORT_DIRECTION_DOT_MIN
      || elapsedMs - sortState.lastSortMs < SPATIAL_CAPTURE_SORT_INTERVAL_MS
    ) return
    const pendingDirection = sortState.pendingDirection
    if (!pendingDirection || dotSortDirection(pendingDirection, nextDirection) < SPATIAL_CAPTURE_SORT_DIRECTION_DOT_MIN) {
      sortState.pendingDirection = nextDirection
      sortState.pendingSinceMs = elapsedMs
      return
    }
    if (elapsedMs - sortState.pendingSinceMs < SPATIAL_CAPTURE_SORT_SETTLE_MS) return
    updateGaussianSplatGeometrySort(geometry, state.load, pendingDirection)
    sortStateRef.current = {
      direction: pendingDirection,
      lastProgressiveMs: sortState.lastProgressiveMs,
      lastSortMs: elapsedMs,
      pendingDirection: null,
      pendingSinceMs: 0,
    }
  })
  const pointCloudMaterial = React.useMemo(() => {
    if (state.status !== 'ready' || state.load.pointCloud.kind === 'gaussian-splat') return null
    return buildPointCloudMaterial({
      hasColor: !!state.load.pointCloud.colors,
      dimmed,
      pointCount: state.load.pointCloud.pointCount,
    })
  }, [dimmed, state])
  React.useEffect(() => () => pointCloudMaterial?.dispose(), [pointCloudMaterial])
  React.useEffect(() => {
    onFitChange?.(fit)
    return () => {
      onFitChange?.(null)
    }
  }, [fit, onFitChange])

  if (state.status !== 'ready' || !geometry || !fit) {
    return <SpatialCaptureStatusMarker color={state.status === 'error' ? '#f97316' : '#38bdf8'} />
  }

  const bounds = state.load.pointCloud.bounds
  const gridPosition: [number, number, number] = state.load.pointCloud.kind === 'gaussian-splat'
    ? [0, 0, 0]
    : [bounds.center[0], bounds.min[1], bounds.center[2]]

  return (
    <>
      {immersiveSessionMode !== 'immersive-ar' ? createPortal(
        <>
          <color attach="background" args={[SPATIAL_CAPTURE_BACKGROUND]} />
          <fog attach="fog" args={[SPATIAL_CAPTURE_FOG, 260, 680]} />
        </>,
        scene,
      ) : null}
      <group name={`agentic_os_spatial_capture_manifest_${manifest.format}`} scale={[fit.scale, fit.scale, fit.scale]} position={fit.position}>
        {gaussianSplatMaterial && geometry instanceof THREE.InstancedBufferGeometry
          ? (
            <mesh name="agentic_os_spatial_capture_gaussian_splats" geometry={geometry} frustumCulled={false} renderOrder={2}>
              <primitive object={gaussianSplatMaterial} attach="material" />
            </mesh>
          )
          : (
            <points name="agentic_os_spatial_capture_point_cloud" geometry={geometry} frustumCulled={false} renderOrder={2}>
              {pointCloudMaterial ? <primitive object={pointCloudMaterial} attach="material" /> : null}
            </points>
          )}
	        <gridHelper args={[fit.stageSpan / fit.scale, 24, SPATIAL_CAPTURE_GRID_MAJOR, SPATIAL_CAPTURE_GRID_MINOR]} position={gridPosition} />
        <SpatialCaptureSelectionOverlay action={spatialCenterAction} load={state.load} tool={spatialTool} />
	      </group>
    </>
  )
}
