import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import {
  CITY_SIM_MAX_BUILDING_HEIGHT,
  CITY_SIM_PARCEL_DEPTH,
  resolveCitySimCameraFraming,
  type CitySimCameraFraming,
} from '@/features/game-city-sim/citySimCameraFraming'

function projectStageBounds(
  framing: CitySimCameraFraming,
  columns: number,
  rows: number,
): Readonly<{ maximumX: number; maximumY: number }> {
  const camera = new THREE.OrthographicCamera(
    framing.left,
    framing.right,
    framing.top,
    framing.bottom,
    framing.near,
    framing.far,
  )
  camera.position.set(...framing.position)
  camera.up.set(0, 1, 0)
  camera.lookAt(...framing.target)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  let maximumX = 0
  let maximumY = 0
  const maximumStageY = CITY_SIM_PARCEL_DEPTH + CITY_SIM_MAX_BUILDING_HEIGHT

  for (const x of [-columns / 2, columns / 2]) {
    for (const y of [0, maximumStageY]) {
      for (const z of [-rows / 2, rows / 2]) {
        const projected = new THREE.Vector3(x, y, z).project(camera)
        maximumX = Math.max(maximumX, Math.abs(projected.x))
        maximumY = Math.max(maximumY, Math.abs(projected.y))
      }
    }
  }
  return Object.freeze({ maximumX, maximumY })
}

export function testCitySimCameraFitsSupportedGridsAcrossPortraitResize() {
  for (const size of [4, 8, 64]) {
    for (const [viewportWidth, viewportHeight] of [[375, 812], [812, 375]]) {
      const framing = resolveCitySimCameraFraming({
        columns: size,
        rows: size,
        viewportHeight,
        viewportWidth,
      })
      const bounds = projectStageBounds(framing, size, size)
      assert.ok(
        bounds.maximumX <= 0.94,
        `${size}x${size} width must fit ${viewportWidth}x${viewportHeight}; got ${bounds.maximumX}`,
      )
      assert.ok(
        bounds.maximumY <= 0.94,
        `${size}x${size} height must fit ${viewportWidth}x${viewportHeight}; got ${bounds.maximumY}`,
      )
      assert.ok(
        Math.abs(
          ((framing.right - framing.left) / (framing.top - framing.bottom))
          - (viewportWidth / viewportHeight),
        ) < 1e-10,
      )
    }
  }

  const portrait = resolveCitySimCameraFraming({
    columns: 64,
    rows: 64,
    viewportHeight: 812,
    viewportWidth: 375,
  })
  const landscape = resolveCitySimCameraFraming({
    columns: 64,
    rows: 64,
    viewportHeight: 375,
    viewportWidth: 812,
  })
  assert.ok(portrait.top > landscape.top)

  const focused = resolveCitySimCameraFraming({
    columns: 64,
    rows: 64,
    selectedParcelId: 'r63c63',
    viewportHeight: 812,
    viewportWidth: 375,
  })
  assert.deepEqual(focused.target, [31.5, 0, 31.5])
  const focusedBounds = projectStageBounds(focused, 64, 64)
  assert.ok(focusedBounds.maximumX <= 0.94)
  assert.ok(focusedBounds.maximumY <= 0.94)
  const focusedCamera = new THREE.OrthographicCamera(
    focused.left,
    focused.right,
    focused.top,
    focused.bottom,
    focused.near,
    focused.far,
  )
  focusedCamera.position.set(...focused.position)
  focusedCamera.lookAt(
    focused.target[0],
    focused.target[1],
    focused.target[2],
  )
  focusedCamera.updateProjectionMatrix()
  focusedCamera.updateMatrixWorld(true)
  const focusedParcel = new THREE.Vector3(...focused.target).project(focusedCamera)
  assert.ok(Math.abs(focusedParcel.x) < 1e-10)
  assert.ok(Math.abs(focusedParcel.y) < 1e-10)
  assert.throws(
    () => resolveCitySimCameraFraming({
      columns: 4,
      rows: 4,
      selectedParcelId: 'r63c63',
      viewportHeight: 812,
      viewportWidth: 375,
    }),
    /outside the grid/,
  )

  const stageSource = readFileSync(
    resolve(process.cwd(), 'src/features/game-city-sim/CitySimStage.tsx'),
    'utf8',
  )
  assert.ok(stageSource.includes('resolveCitySimCameraFraming({'))
  assert.ok(stageSource.includes('selectedParcelId: cameraFocusRequest.parcelId'))
  assert.ok(stageSource.includes('cityCamera.updateProjectionMatrix()'))
  assert.ok(stageSource.includes('if (get().camera === cityCamera) set({ camera: previousCamera })'))
  const projectionSource = readFileSync(
    resolve(process.cwd(), 'src/features/game-city-sim/CitySimPanelProjection.tsx'),
    'utf8',
  )
  assert.ok(projectionSource.includes('requestCitySimCameraFocus(opened.selectedParcelId)'))
  assert.ok(projectionSource.includes('openCitySimSurface({ openPanel: false })'))
}
