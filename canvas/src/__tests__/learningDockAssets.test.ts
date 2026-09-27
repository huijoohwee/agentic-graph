import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three'
import { CHARGE_TRUCK_DIMENSIONS as truck, DRONE002_DIMENSIONS as drone, chargeTruckAssemblySize, chargeTruckLidAngle, chargeTruckLidPose } from '../features/python-learning/learningDockAssets'
import { learningAssetCameraPose, resolveLearningAssetViewport, type LearningAssetViewport } from '../features/python-learning/learningCameraPose'

type Size = readonly [number, number, number]
const close = (actual: number, expected: number, label = '') => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`)
function lidBounds(side: -1 | 1, angle: number) {
  const pose = chargeTruckLidPose(side, angle), group = new Group(), geometry = new BoxGeometry(...pose.leafSize)
  const material = new MeshBasicMaterial(), leaf = new Mesh(geometry, material)
  group.position.set(...pose.hinge); group.rotation.x = pose.rotationX
  leaf.position.set(...pose.leafCenter); group.add(leaf); group.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(group)
  geometry.dispose(); material.dispose()
  return bounds
}

test('specified three-millimetre shell retains its clear bay and the assumed drone fits when stowed', () => {
  assert.deepEqual(truck.shell, [0.22, 0.09, 0.16])
  assert.equal(truck.wall, 0.003)
  assert.deepEqual(truck.bay, [0.214, 0.084, 0.154])
  truck.shell.forEach((extent, axis) => close(extent - 2 * truck.wall, truck.bay[axis], `clear axis ${axis}`))
  assert.equal(drone.measured, false, 'the reference photograph cannot prove physical drone dimensions')
  assert.ok(drone.size[0] < truck.bay[0] && drone.size[2] < truck.bay[2])
  assert.ok(drone.dockedBaseY > truck.wall, 'docked feet clear the bottom shell')
  assert.ok(drone.dockedBaseY + drone.size[1] < truck.shell[1] - truck.wall, 'stowed drone clears the closed lid underside')
  assert.ok(truck.closedAssembly[0] > truck.shell[0] && truck.closedAssembly[2] > truck.shell[2], 'accessories are reported outside the specified shell')
})

test('both real lid transforms cover the roof when closed and fold upwards without obstructing the open bay', () => {
  for (const side of [-1, 1] as const) {
    const closed = lidBounds(side, 0), open = lidBounds(side, Math.PI / 2)
    close(closed.min.y, 0.087, 'closed underside'); close(closed.max.y, 0.09, 'closed top')
    close(closed.min.x, -0.11); close(closed.max.x, 0.11)
    close(closed.min.z, side === -1 ? -0.08 : 0); close(closed.max.z, side === -1 ? 0 : 0.08)
    close(open.min.y, 0.09, 'open hinge height'); close(open.max.y, 0.17, 'open tip height')
    assert.ok(side === -1 ? open.max.z <= -truck.bay[2] / 2 + 1e-7 : open.min.z >= truck.bay[2] / 2 - 1e-7)
    for (const angle of [0, Math.PI / 6, Math.PI / 3, Math.PI / 2]) {
      const bounds = lidBounds(side, angle), assembly = chargeTruckAssemblySize(angle)
      assert.ok(bounds.min.y >= closed.min.y - 1e-7, 'leaves rise rather than rotate into the bay')
      assert.ok(bounds.max.y <= assembly[1] && Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) <= assembly[2] / 2)
    }
    assert.ok(drone.clearanceBaseY > open.max.y, 'horizontal departure clears both fully open leaves')
  }
})

test('invalid or excessive lid requests keep finite bounded geometry', () => {
  for (const value of [-100, -1, 0, 0.5, Math.PI / 2, 100, NaN, Infinity, -Infinity]) {
    const angle = chargeTruckLidAngle(value), size = chargeTruckAssemblySize(value)
    assert.ok(Number.isFinite(angle) && angle >= 0 && angle <= Math.PI / 2)
    assert.ok(size.every(extent => Number.isFinite(extent) && extent > 0))
  }
  assert.deepEqual(chargeTruckAssemblySize(-1), chargeTruckAssemblySize(0))
  assert.deepEqual(chargeTruckAssemblySize(100), chargeTruckAssemblySize(Math.PI / 2))
  assert.deepEqual(chargeTruckAssemblySize(NaN), truck.closedAssembly)
})

test('close inspection camera targets the asset and contains all corners at true metre scale', () => {
  const position: Size = [3, 0.004, -2]
  for (const size of [truck.closedAssembly, chargeTruckAssemblySize(Math.PI / 2), drone.size, [16, 4, 16] as const]) {
    const before = JSON.stringify({ position, size }), pose = learningAssetCameraPose(position, size)
    const camera = new PerspectiveCamera(pose.fov, 1, 0.01, 1000)
    camera.position.set(pose.position.x, pose.position.y, pose.position.z)
    camera.quaternion.set(pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w)
    camera.zoom = pose.zoom!; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
    assert.equal(pose.zoom, 1)
    close(pose.target.x, position[0]); close(pose.target.y, position[1] + size[1] / 2); close(pose.target.z, position[2])
    const distance = camera.position.distanceTo(new Vector3(pose.target.x, pose.target.y, pose.target.z))
    assert.ok(Number.isFinite(distance) && distance >= 0.3 - 1e-7)
    if (size[0] < 1) assert.ok(distance < 1, 'miniature assets get a close view, not warehouse-scale framing')
    for (const x of [-0.5, 0.5]) for (const y of [0, 1]) for (const z of [-0.5, 0.5]) {
      const projected = new Vector3(position[0] + size[0] * x, position[1] + size[1] * y, position[2] + size[2] * z).project(camera)
      assert.ok(projected.toArray().every(value => Number.isFinite(value) && Math.abs(value) < 1), `asset corner outside close view: ${projected.toArray()}`)
    }
    assert.equal(JSON.stringify({ position, size }), before)
  }
})

test('camera framing rejects invalid bounds and replaces invalid inherited lens values', () => {
  for (const [position, size] of [
    [[NaN, 0, 0], [1, 1, 1]], [[0, Infinity, 0], [1, 1, 1]],
    [[0, 0, 0], [0, 0, 0]], [[0, 0, 0], [-1, 1, 1]], [[0, 0, 0], [NaN, 1, 1]],
  ] as [Size, Size][]) assert.throws(() => learningAssetCameraPose(position, size), /finite position and positive bounds/)
  const initial = learningAssetCameraPose([0, 0, 0], drone.size)
  for (const fov of [NaN, Infinity, -1, 0, 101]) {
    const pose = learningAssetCameraPose([0, 0, 0], drone.size, { ...initial, fov, zoom: 99 })
    assert.equal(pose.fov, 50); assert.equal(pose.zoom, 1)
  }
})

test('asset corners fit the unobscured camera rectangle with inset right and bottom panels', () => {
  const position: Size = [10, 0.004, 9]
  const viewports: LearningAssetViewport[] = [
    { viewportW: 1345, viewportH: 952, left: 390, top: 190, width: 540, height: 430 },
    { viewportW: 390, viewportH: 844, left: 0, top: 190, width: 252, height: 360 },
    { viewportW: 1440, viewportH: 600, left: 0, top: 80, width: 900, height: 310 },
  ]
  for (const viewport of viewports) for (const fov of [10, 50, 100]) for (const size of [truck.closedAssembly, chargeTruckAssemblySize(Math.PI / 2), drone.size, [16, 4, 16] as const]) {
    const initial = learningAssetCameraPose(position, size)
    const pose = learningAssetCameraPose(position, size, { ...initial, fov }, viewport)
    const camera = new PerspectiveCamera(pose.fov, viewport.viewportW / viewport.viewportH, 0.001, 10000)
    camera.position.set(pose.position.x, pose.position.y, pose.position.z)
    camera.quaternion.set(pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w)
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
    const center = new Vector3(position[0], position[1] + size[1] / 2, position[2]).project(camera)
    close((center.x + 1) * viewport.viewportW / 2, viewport.left + viewport.width / 2, 'visible horizontal center')
    close((1 - center.y) * viewport.viewportH / 2, viewport.top + viewport.height / 2, 'visible vertical center')
    for (const x of [-0.5, 0.5]) for (const y of [0, 1]) for (const z of [-0.5, 0.5]) {
      const projected = new Vector3(position[0] + size[0] * x, position[1] + size[1] * y, position[2] + size[2] * z).project(camera)
      const px = (projected.x + 1) * viewport.viewportW / 2, py = (1 - projected.y) * viewport.viewportH / 2
      assert.ok(px > viewport.left && px < viewport.left + viewport.width, `corner hidden horizontally: ${px}`)
      assert.ok(py > viewport.top && py < viewport.top + viewport.height, `corner hidden vertically: ${py}`)
      assert.ok(Math.abs(projected.z) < 1, 'corner within camera depth range')
    }
    assert.equal(pose.zoom, 1, 'geometry remains at its metre scale')
  }
})

test('viewport measurement reuses the native occluder frame and catches inset floating panels', () => {
  const dom = new JSDOM(`<canvas id="unrelated"></canvas><div data-kg-three-canvas-owner="1"><canvas id="scene"></canvas></div>
    <section id="editor" data-kg-workspace-visible-viewport-occluder></section>
    <aside id="assets" class="ModalContainer"><section aria-label="Floating panel"></section></aside>
    <aside id="timeline" class="ModalContainer" aria-label="Strybldr Timeline"></aside>
    <section id="controls" aria-label="Lesson scene controls"></section>`)
  const doc = dom.window.document
  const rect = (id: string, left: number, top: number, width: number, height: number) => Object.defineProperty(doc.getElementById(id), 'getBoundingClientRect', {
    value: () => ({ left, top, width, height, right: left + width, bottom: top + height }), configurable: true,
  })
  rect('scene', 110, 50, 1200, 800); rect('editor', 110, 50, 300, 800)
  rect('assets', 970, 58, 332, 784); rect('timeline', 418, 580, 884, 258); rect('controls', 418, 122, 540, 86)
  assert.deepEqual(resolveLearningAssetViewport(doc), { viewportW: 1200, viewportH: 800, left: 300, top: 170, width: 548, height: 348 })
  doc.getElementById('assets')!.style.display = 'none'
  assert.equal(resolveLearningAssetViewport(doc)?.width, 900, 'hidden floating panel does not consume camera space')
  doc.getElementById('scene')!.remove()
  assert.equal(resolveLearningAssetViewport(doc), undefined, 'unrelated canvases cannot become the framing owner')
  dom.window.close()
})

test('invalid visible rectangles fail explicitly instead of producing a nonfinite camera pose', () => {
  const initial = { viewportW: 1000, viewportH: 800, left: 100, top: 100, width: 500, height: 400 }
  for (const change of [{ width: 0 }, { viewportW: NaN }, { left: -1 }, { top: 700 }, { height: Infinity }]) {
    assert.throws(() => learningAssetCameraPose([0, 0, 0], drone.size, undefined, { ...initial, ...change }), /visible viewport/)
  }
})
