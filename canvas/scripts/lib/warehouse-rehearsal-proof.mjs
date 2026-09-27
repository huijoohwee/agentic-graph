import assert from 'node:assert/strict'
import { join } from 'node:path'
import { expect } from 'playwright/test'
import { dismissVisibleFloatingPanel } from './panel-close-helpers.mjs'

const inspectionSelector = '[data-warehouse-inspection="active"]'
const cameraSelector = 'svg[data-warehouse-camera]'

// Exercise production DOM controls only. The caller's existing read-only inspector
// is used solely to compare the Python source binding and completed run receipt.
export async function proveWarehouseRehearsal({
  page, pane, lessons, inspect, selectPython, selectSurface, editRichSource, awaitStoredSource, output,
}) {
  console.log('Warehouse rehearsal: checking assets and native timeline')
  const originalLesson = await pane.getByLabel('Python lesson', { exact: true }).inputValue()
  const restoreLesson = lessons.find(lesson => lesson.id === originalLesson)
  assert.ok(restoreLesson, 'offline proof must restore its existing lesson')
  const originalBinding = (await inspect()).binding
  const drone = lessons.find(lesson => lesson.id === 'drone')
  assert.ok(drone, 'warehouse rehearsal requires the existing drone lesson')
  await pane.getByLabel('Python lesson', { exact: true }).selectOption(drone.id)
  await pane.getByRole('button', { name: 'Code', exact: true }).click()
  await editRichSource(drone.solution)
  await pane.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(pane).toHaveAttribute('data-learning-state', 'completed', { timeout: 20000 })
  const pythonFlight = await inspect()
  assert.equal(pythonFlight.result.grade.passed, true, 'rehearsal starts with a completed Python flight')

  const canvas = page.getByRole('region', { name: 'Canvas viewport', exact: true })
  const controls = canvas.getByRole('region', { name: 'Lesson scene controls', exact: true })
  await pane.getByRole('button', { name: 'View Canvas', exact: true }).click()
  await selectSurface('2D')
  await dismissVisibleFloatingPanel(page)
  const plan = page.getByRole('region', { name: 'Drone lesson floor plan', exact: true })
  await expect(plan).toBeVisible()
  await plan.getByRole('button', { name: 'Fit warehouse', exact: true }).click()
  const originalPosition = await controls.getByLabel('Python lesson position', { exact: true }).innerText()
  const assetNames = ['Mobile charging truck', 'ESP32 quad · drone-002']
  for (const name of assetNames) {
    const asset = plan.getByRole('button', { name: `Select ${name}`, exact: true })
    await expect(asset).toBeVisible()
    assert.equal(await asset.evaluate(element => element.ownerSVGElement?.getAttribute('aria-label')), 'Measured warehouse floor')
  }
  await controls.getByRole('button', { name: 'Scene assets', exact: true }).click()
  const media = page.getByRole('region', { name: 'XR Media workspace', exact: true })
  await media.getByRole('button', { name: 'Assets', exact: true }).click()
  const catalog = media.getByRole('region', { name: 'Drone lesson assets', exact: true })
  const search = catalog.getByRole('searchbox', { name: 'Find a lesson asset', exact: true })
  for (const name of assetNames) {
    await search.fill(name)
    const asset = catalog.getByRole('button', { name: `Inspect ${name}`, exact: true })
    await expect(asset).toBeVisible()
    await asset.click()
    await expect(asset).toHaveAttribute('aria-pressed', 'true')
    await expect(catalog.getByRole('region', { name: 'Selected lesson asset', exact: true })).toContainText(name)
  }
  await page.screenshot({ path: join(output, 'offline-warehouse-assets.png'), fullPage: true })
  await dismissVisibleFloatingPanel(page)

  await controls.getByRole('button', { name: 'Warehouse rehearsal', exact: true }).click()
  const bottomPanel = page.locator('[data-kg-strybldr-bottom-timeline-panel="1"]')
  const timeline = bottomPanel.getByRole('region', { name: 'Warehouse inspection timeline', exact: true })
  await expect(bottomPanel).toBeVisible()
  await expect(timeline).toHaveAttribute('data-warehouse-inspection', 'active')
  await expect(page.locator(inspectionSelector)).toHaveCount(1)
  await expect(timeline).toHaveAttribute('data-warehouse-frame', '0')
  await expect(timeline.getByRole('region', { name: 'Gantt-Timeline transport', exact: true })).toHaveAttribute('data-kg-gantt-timeline-transport', 'bottomPanel')
  const start = timeline.getByRole('button', { name: 'Start playback', exact: true })
  const pause = timeline.getByRole('button', { name: 'Pause playback', exact: true })
  await expect(start).toBeVisible()
  const truck = plan.getByRole('button', { name: 'Select Mobile charging truck', exact: true })
  const startTruckTransform = await truck.getAttribute('transform')
  const cue = timeline.getByRole('button', { name: 'Seek Drone001 rack faces / all rendered tiers', exact: true })
  const cueTitle = await cue.getAttribute('title')
  const cueSeconds = Number(cueTitle?.match(/ · ([\d.]+)–[\d.]+ s$/)?.[1])
  assert.ok(Number.isFinite(cueSeconds) && cueSeconds > 0, 'native cue exposes its nonzero start time')
  // Native keyboard activation also reaches narrow, horizontally clipped cue buttons.
  await cue.press('Enter')
  await expect(timeline).not.toHaveAttribute('data-warehouse-frame', '0')
  await expect(start).toBeVisible()
  const cuePosition = await controls.getByLabel('Python lesson position', { exact: true }).innerText()
  const visibleSeconds = Number(cuePosition.match(/Facility rehearsal · ([\d.]+) s/)?.[1])
  assert.ok(Math.abs(visibleSeconds - cueSeconds) < 0.2, 'cue jumps to its displayed start, allowing one presentation frame')
  assert.notEqual(await truck.getAttribute('transform'), startTruckTransform, '2D truck follows the native cue position')

  const feed = timeline.getByRole('region', { name: 'Simulated warehouse video pipeline', exact: true })
  const camera = feed.locator(cameraSelector)
  await expect(camera).toHaveAttribute('data-warehouse-camera', 'drone001')
  await expect(camera).not.toHaveAttribute('data-warehouse-camera-frame', 'pending')
  await expect(camera).toHaveAttribute('data-warehouse-bounds', 'disabled')
  await expect(camera.locator('[data-warehouse-detection]')).toHaveCount(0)
  await feed.getByRole('button', { name: 'Open Motion Control', exact: true }).click()
  const bounds = page.getByRole('checkbox', { name: /^Bounding box ·/ })
  await expect(bounds).not.toBeChecked()
  await bounds.check()
  await expect(bounds).toBeChecked()
  await expect(camera).toHaveAttribute('data-warehouse-bounds', 'enabled')
  await dismissVisibleFloatingPanel(page)
  // Motion Control opens XR; return through the native menu before inspecting the SVG plan.
  await selectSurface('2D')
  await expect(plan).toBeVisible()

  console.log('Warehouse rehearsal: checking native playback and camera frame ownership')
  const assertMatchingDetections = async () => {
    const displayed = await camera.getAttribute('data-warehouse-camera-frame')
    assert.ok(displayed && displayed !== 'pending', 'paused camera has a delivered synthetic frame')
    const detections = await camera.locator('[data-warehouse-detection]').evaluateAll(elements => elements.map(element => element.getAttribute('data-warehouse-detection-frame')))
    assert.ok(detections.length > 0, 'existing Motion Control toggle reveals detection fixtures')
    assert.ok(detections.every(frame => frame === displayed), 'every detection belongs to the displayed frame')
    return displayed
  }
  const beforePlayback = await assertMatchingDetections()
  await start.click()
  await expect(pause).toBeVisible()
  await expect(camera).not.toHaveAttribute('data-warehouse-camera-frame', beforePlayback, { timeout: 15000 })
  await pause.click()
  await expect(start).toBeVisible()
  const pausedFrame = await assertMatchingDetections()
  const pausedPosition = await timeline.getAttribute('data-warehouse-frame')
  // More than three 12-fps presentation frames: a paused clock must stay fixed.
  await page.waitForTimeout(350)
  assert.equal(await timeline.getAttribute('data-warehouse-frame'), pausedPosition, 'native Pause freezes rehearsal position')
  assert.equal(await camera.getAttribute('data-warehouse-camera-frame'), pausedFrame, 'native Pause freezes the displayed camera frame')
  const cameraFrames = {}
  for (const [label, id] of [['Drone 001', 'drone001'], ['Drone 002', 'drone002'], ['CCTV', 'cctv']]) {
    const choice = feed.getByRole('group', { name: 'Simulated camera source', exact: true }).getByRole('button', { name: label, exact: true })
    await choice.click()
    await expect(choice).toHaveAttribute('aria-pressed', 'true')
    await expect(camera).toHaveAttribute('data-warehouse-camera', id)
    cameraFrames[id] = await assertMatchingDetections()
  }
  assert.equal(new Set(Object.values(cameraFrames)).size, 3, 'each native camera selector displays its own frame identity')
  await camera.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(output, 'offline-warehouse-rehearsal.png'), fullPage: true })
  await feed.getByRole('button', { name: 'Open Motion Control', exact: true }).click()
  await bounds.uncheck()
  await expect(bounds).not.toBeChecked()
  await expect(camera).toHaveAttribute('data-warehouse-bounds', 'disabled')
  await expect(camera.locator('[data-warehouse-detection]')).toHaveCount(0)
  await dismissVisibleFloatingPanel(page)
  await selectSurface('2D')
  await expect(plan).toBeVisible()

  // The native first cue is the rewind control for this generated fixed timeline.
  await timeline.getByRole('button', { name: 'Seek Programmed aisle survey / carry drone002', exact: true }).press('Enter')
  await expect(timeline).toHaveAttribute('data-warehouse-frame', '0')
  await expect(start).toBeVisible()
  await expect(camera).toHaveAttribute('data-warehouse-camera-frame', 'pending')
  assert.equal(await truck.getAttribute('transform'), startTruckTransform, 'rewind restores the original 2D truck position')
  await timeline.getByRole('button', { name: 'Return to Python flight', exact: true }).click()
  await expect(page.locator(inspectionSelector)).toHaveCount(0)
  await expect(controls.getByRole('button', { name: 'Warehouse rehearsal', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(controls.getByLabel('Python lesson position', { exact: true })).toHaveText(originalPosition)
  await bottomPanel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(bottomPanel).not.toBeVisible()
  await page.getByRole('navigation', { name: 'Main Toolbar', exact: true }).getByRole('button', { name: 'Edit Python code', exact: true }).click()
  await expect(pane).toBeVisible()
  await selectPython()
  const returned = await inspect()
  assert.deepEqual(returned.binding, pythonFlight.binding, 'Return to Python flight preserves source, lesson and run identity')
  assert.deepEqual(returned.result, pythonFlight.result, 'rehearsal never changes the completed Python flight result')
  assert.equal(returned.state, 'completed')
  assert.equal(returned.stale, false)

  // Resume the owner's saved travel lesson before its independent worker-corruption proof.
  await pane.getByLabel('Python lesson', { exact: true }).selectOption(originalLesson)
  await pane.getByRole('button', { name: 'Code', exact: true }).click()
  await editRichSource(restoreLesson.solution)
  assert.equal((await inspect()).binding.sourceDigest, originalBinding.sourceDigest, 'the surrounding offline source is restored exactly')
  await pane.getByRole('button', { name: 'Save source', exact: true }).click()
  await awaitStoredSource(restoreLesson.solution)
  console.log('Warehouse rehearsal: source, result, bounds, cameras and rewind verified')
  return { nativeBottomPanel: true, nativeCueAndTransport: true, pauseFreezesFrames: true,
    motionControlBounds: true, cameraFrames, catalogAndSvgAssets: assetNames,
    pythonSourceAndResultPreserved: true, runId: pythonFlight.binding.expectedRunId }
}
