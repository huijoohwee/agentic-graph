import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { CityParcelCoordinateControls } from '@/features/game-city-sim/CityParcelCoordinateControls'
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

export async function testCitySimCoordinateControlsStayLinearAndNormalizeInput() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const selections: Array<readonly [number, number, CityInputSource]> = []

  function Harness() {
    const [selected, setSelected] = React.useState<readonly [number, number] | null>(null)
    return (
      <CityParcelCoordinateControls
        busy={false}
        columns={64}
        onSelect={(row, column, source) => {
          selections.push([row, column, source])
          setSelected([row, column])
        }}
        rows={64}
        selectedColumn={selected?.[1] ?? null}
        selectedRow={selected?.[0] ?? null}
      />
    )
  }

  try {
    await mountReactRoot(root, <Harness />)
    const rowSelect = container.querySelector(
      '[data-kg-city-sim-parcel-row="1"]',
    ) as HTMLSelectElement | null
    const columnSelect = container.querySelector(
      '[data-kg-city-sim-parcel-column="1"]',
    ) as HTMLSelectElement | null
    assert.ok(rowSelect)
    assert.ok(columnSelect)
    assert.equal(rowSelect.options.length, 65)
    assert.equal(columnSelect.options.length, 65)
    assert.equal(container.querySelectorAll('option').length, 130)

    await act(async () => {
      Simulate.keyDown(rowSelect)
      rowSelect.value = '63'
      Simulate.change(rowSelect)
    })
    assert.deepEqual(selections.at(-1), [63, 0, 'keyboard'])

    await act(async () => {
      Simulate.touchStart(columnSelect)
      columnSelect.value = '63'
      Simulate.change(columnSelect)
    })
    assert.deepEqual(selections.at(-1), [63, 63, 'touch'])
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
