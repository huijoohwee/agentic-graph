import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { CityPoiZoningControls } from '@/features/game-city-sim/CityPoiZoningControls'
import { CitySimFloatingPanelView } from '@/features/game-city-sim/CitySimFloatingPanelView'
import { resetCityInputQueueForTests, type CityInputSource } from '@/features/game-city-sim/citySimInputRuntime'
import { resetCitySimRuntimeForTests } from './citySimAuthoritativeSource'
import {
  publishCitySimFailure,
  publishCitySimSnapshot,
  publishCitySimSuccess,
} from '@/features/game-city-sim/citySimRuntimeState'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

export async function testCitySimPoiControlsExposeCanonicalIdentityAndNormalizeInput() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const selections: Array<readonly [string, CityInputSource]> = []

  function Harness() {
    const [selected, setSelected] = React.useState<string | null>(null)
    return (
      <CityPoiZoningControls
        busy={false}
        onSelect={(poiId, source) => {
          selections.push([poiId, source])
          setSelected(poiId)
        }}
        pois={[
          { id: 'marina-bay-sands', label: 'Marina Bay Sands' },
          { id: 'singapore-flyer', label: 'Singapore Flyer' },
          { id: 'gardens-by-the-bay', label: 'Gardens by the Bay' },
        ]}
        selectedPoiId={selected}
      />
    )
  }

  try {
    await mountReactRoot(root, <Harness />)
    const poiSelect = container.querySelector(
      '[data-kg-city-sim-poi-id="1"]',
    ) as HTMLSelectElement | null
    assert.ok(poiSelect)
    assert.equal(poiSelect.options.length, 4)
    assert.equal(container.textContent?.includes('POI zoning target'), true)

    await act(async () => {
      Simulate.keyDown(poiSelect)
      poiSelect.value = 'singapore-flyer'
      Simulate.change(poiSelect)
    })
    assert.deepEqual(selections.at(-1), ['singapore-flyer', 'keyboard'])

    await act(async () => {
      Simulate.touchStart(poiSelect)
      poiSelect.value = 'gardens-by-the-bay'
      Simulate.change(poiSelect)
    })
    assert.deepEqual(selections.at(-1), ['gardens-by-the-bay', 'touch'])
  } finally {
    await unmountReactRoot(root)
    container.remove()
    restore()
  }
}

export async function testCitySimOperationStatusIsPoliteWithoutTickFlooding() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  resetCitySimRuntimeForTests({ webglSupported: true })
  resetCityInputQueueForTests()

  try {
    await mountReactRoot(root, <CitySimFloatingPanelView />)
    const status = container.querySelector(
      '[data-kg-city-sim-operation-status="1"]',
    )
    assert.ok(status)
    assert.equal(status.getAttribute('role'), 'status')
    assert.equal(status.getAttribute('aria-live'), 'polite')
    assert.equal(status.getAttribute('aria-atomic'), 'true')

    await act(async () => {
      publishCitySimSnapshot({
        saveStatus: 'saving',
        message: 'Saving committed city state…',
      })
    })
    assert.equal(status.textContent, '')

    await act(async () => {
      publishCitySimSuccess(
        'save',
        'Saved and read back the City Document.',
        { saveStatus: 'saved' },
      )
    })
    assert.equal(status.textContent, 'Saved and read back the City Document.')

    await act(async () => {
      publishCitySimSuccess('tick', 'Committed deterministic city tick 1.')
    })
    assert.equal(status.textContent, '')

    await act(async () => {
      publishCitySimFailure('zone', 'unknown-parcel', 'Parcel does not exist.')
    })
    assert.equal(status.textContent, '')
    assert.equal(
      container.querySelector('[role="alert"]')?.textContent?.includes('Parcel does not exist.'),
      true,
    )
    assert.equal(container.querySelectorAll('[role="alert"]').length, 1)
    assert.equal(container.querySelectorAll('[role="status"]').length, 1)
  } finally {
    await unmountReactRoot(root)
    container.remove()
    restore()
  }
}

export function testCitySimMediaProjectionRetainsVerticalScrollOwnership() {
  const router = readFileSync(
    resolve(process.cwd(), 'src/lib/toolbar/FloatingPanelXrSceneViews.tsx'),
    'utf8',
  )
  assert.ok(router.includes("view === 'media' ? 'overflow-auto' : 'overflow-hidden'"))
  assert.ok(router.includes('data-kg-city-sim-panel-scroll-owner'))
}
