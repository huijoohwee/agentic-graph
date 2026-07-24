import React from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import {
  cityInputSourceFromPointerType,
  type CityInputSource,
} from './citySimInputRuntime'
import {
  CITY_SIM_PARCEL_DEPTH,
  CITY_SIM_PARCEL_GAP,
  resolveCitySimCameraFraming,
} from './citySimCameraFraming'
import {
  clearCitySimCameraFocusRequest,
  readCitySimCameraFocusRequest,
  subscribeCitySimCameraFocusRequest,
} from './citySimCameraFocusRequest'

export type CitySimStageParcel = Readonly<{
  id: string
  row: number
  column: number
  zone: 'unzoned' | 'residential' | 'commercial' | 'industrial'
  landValueCents: number
  population: number
  pollution: number
}>

export type CitySimStageProps = Readonly<{
  active: boolean
  columns: number
  onSelectParcel: (parcelId: string, source: CityInputSource) => void
  parcels: readonly CitySimStageParcel[]
  rows: number
  selectedParcelId: string | null
}>

const ZONE_COLORS = Object.freeze({
  unzoned: new THREE.Color('#64748b'),
  residential: new THREE.Color('#22c55e'),
  commercial: new THREE.Color('#38bdf8'),
  industrial: new THREE.Color('#f59e0b'),
})

function useCitySimOrthographicCamera({
  active,
  columns,
  rows,
  selectedParcelId,
}: {
  active: boolean
  columns: number
  rows: number
  selectedParcelId: string | null
}) {
  const get = useThree(state => state.get)
  const set = useThree(state => state.set)
  const viewportHeight = useThree(state => state.size.height)
  const viewportWidth = useThree(state => state.size.width)
  const cityCamera = React.useMemo(() => new THREE.OrthographicCamera(), [])

  React.useLayoutEffect(() => {
    if (!active) return
    const previousCamera = get().camera
    cityCamera.name = 'kg_city_sim_isometric_topdown_camera'
    set({ camera: cityCamera })

    return () => {
      if (get().camera === cityCamera) set({ camera: previousCamera })
    }
  }, [active, cityCamera, get, set])

  React.useLayoutEffect(() => {
    if (!active) return
    const framing = resolveCitySimCameraFraming({
      columns,
      rows,
      selectedParcelId,
      viewportHeight,
      viewportWidth,
    })
    cityCamera.left = framing.left
    cityCamera.right = framing.right
    cityCamera.top = framing.top
    cityCamera.bottom = framing.bottom
    cityCamera.near = framing.near
    cityCamera.far = framing.far
    cityCamera.position.fromArray(framing.position)
    cityCamera.up.set(0, 1, 0)
    cityCamera.lookAt(...framing.target)
    cityCamera.updateProjectionMatrix()
  }, [
    active,
    cityCamera,
    columns,
    rows,
    selectedParcelId,
    viewportHeight,
    viewportWidth,
  ])
}

function parcelPosition(
  parcel: CitySimStageParcel,
  columns: number,
  rows: number,
): THREE.Vector3 {
  return new THREE.Vector3(
    parcel.column - ((columns - 1) / 2),
    0,
    parcel.row - ((rows - 1) / 2),
  )
}

function buildingHeight(parcel: CitySimStageParcel): number {
  if (parcel.zone === 'unzoned') return 0
  const populationScale = Math.min(1.8, Math.max(0, parcel.population) / 40)
  const landValueScale = Math.min(
    1.2,
    Math.max(0, parcel.landValueCents) / 12_000,
  )
  const zoneBase = parcel.zone === 'commercial'
    ? 0.9
    : parcel.zone === 'industrial'
      ? 0.65
      : 0.45
  return zoneBase + populationScale + landValueScale
}

function CitySimParcelInstances({
  columns,
  onSelectParcel,
  parcels,
  rows,
  selectedParcelId,
}: Omit<CitySimStageProps, 'active'>) {
  const parcelMeshRef = React.useRef<THREE.InstancedMesh | null>(null)
  const buildingMeshRef = React.useRef<THREE.InstancedMesh | null>(null)
  const matrix = React.useMemo(() => new THREE.Matrix4(), [])
  const position = React.useMemo(() => new THREE.Vector3(), [])
  const scale = React.useMemo(() => new THREE.Vector3(), [])
  const quaternion = React.useMemo(() => new THREE.Quaternion(), [])
  const hiddenScale = React.useMemo(() => new THREE.Vector3(0, 0, 0), [])

  React.useLayoutEffect(() => {
    const parcelMesh = parcelMeshRef.current
    const buildingMesh = buildingMeshRef.current
    if (!parcelMesh || !buildingMesh) return

    parcelMesh.count = parcels.length
    buildingMesh.count = parcels.length
    parcelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    buildingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    parcels.forEach((parcel, index) => {
      const basePosition = parcelPosition(parcel, columns, rows)
      const selected = parcel.id === selectedParcelId
      position.set(basePosition.x, CITY_SIM_PARCEL_DEPTH / 2, basePosition.z)
      scale.set(
        1 - CITY_SIM_PARCEL_GAP,
        CITY_SIM_PARCEL_DEPTH,
        1 - CITY_SIM_PARCEL_GAP,
      )
      matrix.compose(position, quaternion, scale)
      parcelMesh.setMatrixAt(index, matrix)
      parcelMesh.setColorAt(
        index,
        selected ? new THREE.Color('#f8fafc') : ZONE_COLORS[parcel.zone],
      )

      const instanceHeight = buildingHeight(parcel)
      position.set(
        basePosition.x,
        CITY_SIM_PARCEL_DEPTH + (instanceHeight / 2),
        basePosition.z,
      )
      scale.set(
        parcel.zone === 'industrial' ? 0.78 : 0.64,
        instanceHeight,
        parcel.zone === 'commercial' ? 0.58 : 0.68,
      )
      matrix.compose(
        position,
        quaternion,
        instanceHeight > 0 ? scale : hiddenScale,
      )
      buildingMesh.setMatrixAt(index, matrix)
      buildingMesh.setColorAt(
        index,
        selected ? new THREE.Color('#fef08a') : ZONE_COLORS[parcel.zone],
      )
    })

    parcelMesh.instanceMatrix.needsUpdate = true
    buildingMesh.instanceMatrix.needsUpdate = true
    if (parcelMesh.instanceColor) parcelMesh.instanceColor.needsUpdate = true
    if (buildingMesh.instanceColor) buildingMesh.instanceColor.needsUpdate = true
    parcelMesh.computeBoundingSphere()
    buildingMesh.computeBoundingSphere()
  }, [
    columns,
    hiddenScale,
    matrix,
    parcels,
    position,
    quaternion,
    scale,
    selectedParcelId,
    rows,
  ])

  const selectInstance = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    const instanceId = event.instanceId
    if (instanceId === undefined) return
    const parcel = parcels[instanceId]
    if (!parcel) return
    event.stopPropagation()
    onSelectParcel(
      parcel.id,
      cityInputSourceFromPointerType(event.pointerType),
    )
  }, [onSelectParcel, parcels])

  const capacity = Math.max(1, parcels.length)
  return (
    <>
      <instancedMesh
        ref={parcelMeshRef}
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        name="kg_city_sim_parcels"
        onPointerDown={selectInstance}
        userData={{ citySimRole: 'parcel-grid', interactive: true }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial vertexColors />
      </instancedMesh>
      <instancedMesh
        ref={buildingMeshRef}
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        name="kg_city_sim_buildings"
        onPointerDown={selectInstance}
        userData={{ citySimRole: 'building-projection', interactive: true }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial vertexColors />
      </instancedMesh>
    </>
  )
}

export function CitySimStage({
  active,
  columns,
  onSelectParcel,
  parcels,
  rows,
  selectedParcelId,
}: CitySimStageProps) {
  const cameraFocusRequest = React.useSyncExternalStore(
    subscribeCitySimCameraFocusRequest,
    readCitySimCameraFocusRequest,
    readCitySimCameraFocusRequest,
  )
  useCitySimOrthographicCamera({
    active,
    columns,
    rows,
    selectedParcelId: cameraFocusRequest.parcelId,
  })
  React.useEffect(() => () => {
    clearCitySimCameraFocusRequest()
  }, [])

  if (!active) return null

  return (
    <group
      name="kg_city_sim_stage"
      userData={{
        additive: true,
        camera: 'isometric-topdown',
        rendererOwner: 'shared-canvas',
      }}
    >
      <ambientLight intensity={0.72} />
      <directionalLight intensity={0.9} position={[8, 14, 6]} />
      <CitySimParcelInstances
        columns={columns}
        onSelectParcel={onSelectParcel}
        parcels={parcels}
        rows={rows}
        selectedParcelId={selectedParcelId}
      />
    </group>
  )
}

export default CitySimStage
