import assert from 'node:assert/strict'
import test from 'node:test'
import type { ComponentType } from 'react'
import {
  createFlightSimMissionStageLoader,
} from '@/lib/three/flightSimMissionStageLoader'
import type {
  FlightSimStageRuntimeController,
} from '@/features/game-flight-sim/flightSimStageRuntimeController'

const MissionStage = (() => null) as ComponentType<{
  geospatialComposite?: boolean
}>
const runtimeController = {} as FlightSimStageRuntimeController

test('mission-stage preload shares in-flight work and retries after rejection', async () => {
  let attempts = 0
  const loader = createFlightSimMissionStageLoader(async () => {
    attempts += 1
    if (attempts === 1) throw new Error('injected first import rejection')
    return {
      createFlightSimMissionStage: controller => {
        assert.equal(controller, runtimeController)
        return MissionStage
      },
    }
  })

  await assert.rejects(loader.load(), /requires its runtime controller/)
  const firstPreload = loader.preload(runtimeController)
  const firstLoad = loader.load()
  assert.equal(loader.load(), firstLoad)
  await assert.rejects(firstPreload, /injected first import rejection/)
  await assert.rejects(firstLoad, /injected first import rejection/)

  await loader.preload(runtimeController)
  const successfulLoad = loader.load()
  assert.equal(attempts, 2)
  assert.equal(await successfulLoad, await loader.load())
  assert.equal((await successfulLoad).default, MissionStage)
})

test('mission-stage preload retries a transient dynamic-import fetch failure in one entry', async () => {
  let attempts = 0
  const loader = createFlightSimMissionStageLoader(async () => {
    attempts += 1
    if (attempts === 1) {
      throw new TypeError('Failed to fetch dynamically imported module')
    }
    return {
      createFlightSimMissionStage: controller => {
        assert.equal(controller, runtimeController)
        return MissionStage
      },
    }
  })

  await loader.preload(runtimeController)

  assert.equal(attempts, 2)
  assert.equal((await loader.load()).default, MissionStage)
})
