import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Euler, Plane, Vector3 } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useLearningSpatialView } from './learningSpatialView'
import { canWalkTo, placementIssue, snapLearningPosition, spatialBlocks, WAREHOUSE_DOORS } from './learningSpatialEditing'
import { cancelLearningPlacement, placeLearningAsset, toggleWarehouseDoor } from './learningSpatialActions'
import { readThreeKeyboardMovementKey, resolveThreeKeyboardMotionDirection } from '../three/threeKeyboardChoreography'
import { PalletLoad } from './LearningDroneRoom'
import { WarehouseRack } from './LearningWarehouseStructure'
import type { LearningLesson } from './learningLessons'

/** Uses the Canvas camera and controls. Walking changes only the review viewpoint. */
function LearningWalkCamera({ lesson }: { lesson: LearningLesson }) {
  const { view, update } = useLearningSpatialView()
  const { camera, gl, controls: rawControls, invalidate } = useThree()
  const controls = rawControls as OrbitControls | undefined
  const keys = useRef(new Set<string>()), drag = useRef<{ x: number; y: number } | null>(null)
  const blocks = useMemo(() => spatialBlocks(lesson, view.placed, view.doors), [lesson, view.placed, view.doors])
  const move = (horizontal: number, vertical: number, amount: number) => {
    const direction = camera.getWorldDirection(new Vector3()); direction.y = 0; direction.normalize()
    const right = new Vector3(-direction.z, 0, direction.x)
    const offset = right.multiplyScalar(horizontal * amount).add(direction.multiplyScalar(-vertical * amount))
    // Small substeps prevent tunnelling through thin doors and partitions.
    const count = Math.max(1, Math.ceil(offset.length() / .05)); offset.divideScalar(count)
    for (let i = 0; i < count; i++) {
      const x = camera.position.x + offset.x, z = camera.position.z + offset.z
      if (canWalkTo(x, z, blocks)) camera.position.set(x, 1.65, z)
    }
    controls?.target.copy(camera.position).add(camera.getWorldDirection(new Vector3()))
    invalidate()
  }
  const moveRef = useRef(move); moveRef.current = move
  useEffect(() => {
    if (!view.walk || gl.xr.isPresenting) return
    const canvas = gl.domElement, previousTab = canvas.getAttribute('tabindex')
    const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), target: controls?.target.clone(), enabled: controls?.enabled }
    if (controls) controls.enabled = false
    canvas.tabIndex = 0; canvas.focus({ preventScroll: true })
    camera.position.set(0, 1.65, 0); camera.lookAt(4, 1.65, 0); controls?.target.set(4, 1.65, 0); invalidate()
    const clear = () => { keys.current.clear(); drag.current = null }
    const keydown = (event: KeyboardEvent) => {
      if (event.target !== canvas || event.altKey || event.metaKey || event.ctrlKey) return
      if (event.key === 'Escape') { clear(); update({ walk: false, message: 'Orbit viewpoint restored.' }); return }
      const key = readThreeKeyboardMovementKey(event.key)
      if (!key) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (!keys.current.has(key)) { const step = resolveThreeKeyboardMotionDirection([key]); if (step) moveRef.current(step[0], step[1], .2) }
      keys.current.add(key); invalidate()
    }
    const keyup = (event: KeyboardEvent) => { const key = readThreeKeyboardMovementKey(event.key); if (key) keys.current.delete(key) }
    const down = (event: PointerEvent) => { if (event.button !== 0) return; canvas.focus({ preventScroll: true }); drag.current = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId) }
    const up = () => { drag.current = null }
    const look = (event: PointerEvent) => {
      if (!drag.current) return
      const rotation = new Euler().setFromQuaternion(camera.quaternion, 'YXZ')
      rotation.y -= (event.clientX - drag.current.x) * .004
      rotation.x = Math.max(-1.2, Math.min(1.2, rotation.x - (event.clientY - drag.current.y) * .004))
      rotation.z = 0; camera.quaternion.setFromEuler(rotation)
      controls?.target.copy(camera.position).add(camera.getWorldDirection(new Vector3()))
      drag.current = { x: event.clientX, y: event.clientY }; invalidate()
    }
    canvas.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup)
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', look)
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', clear)
    canvas.addEventListener('blur', clear); window.addEventListener('blur', clear); document.addEventListener('visibilitychange', clear)
    return () => {
      clear(); canvas.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup)
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', look)
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', clear)
      canvas.removeEventListener('blur', clear); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear)
      if (previousTab === null) canvas.removeAttribute('tabindex'); else canvas.setAttribute('tabindex', previousTab)
      camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion)
      if (controls) { if (saved.target) controls.target.copy(saved.target); controls.enabled = saved.enabled ?? true }
      invalidate()
    }
  }, [view.walk, camera, controls, gl, invalidate])
  const lastCommand = useRef(view.walkCommand?.sequence)
  useEffect(() => {
    if (!view.walk || !view.walkCommand || lastCommand.current === view.walkCommand.sequence) return
    lastCommand.current = view.walkCommand.sequence
    if (view.walkCommand.direction === 'left' || view.walkCommand.direction === 'right') {
      const rotation = new Euler().setFromQuaternion(camera.quaternion, 'YXZ')
      rotation.y += view.walkCommand.direction === 'left' ? .2 : -.2
      camera.quaternion.setFromEuler(rotation); controls?.target.copy(camera.position).add(camera.getWorldDirection(new Vector3())); invalidate()
    } else moveRef.current(0, view.walkCommand.direction === 'forward' ? -1 : 1, .4)
  }, [view.walkCommand, view.walk, camera, invalidate])
  useFrame((_, delta) => {
    if (!view.walk || !keys.current.size || gl.xr.isPresenting) return
    const direction = resolveThreeKeyboardMotionDirection(keys.current)
    if (direction) moveRef.current(direction[0], direction[1], Math.min(delta, .05) * 2)
    invalidate()
  })
  return null
}

export function LearningSpatialInteraction({ lesson }: { lesson: LearningLesson }) {
  const { view, update } = useLearningSpatialView()
  const { gl } = useThree()
  const [hover, setHover] = useState<readonly [number, number, number] | null>(null)
  const template = lesson.obstacles.find(o => `obstacle:${o.id}` === view.placement)
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), [])
  const preview = template && hover ? { position: hover, size: [template.size[0], template.height ?? 1, template.size[1]] as const } : null
  const issue = preview ? placementIssue(preview, spatialBlocks(lesson, view.placed)) : null
  useEffect(() => {
    const canvas = gl.domElement, previous = canvas.style.cursor
    canvas.style.cursor = view.placement ? 'crosshair' : view.walk ? 'grab' : previous
    setHover(null)
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && view.placement) cancelLearningPlacement() }
    window.addEventListener('keydown', escape)
    return () => { canvas.style.cursor = previous; window.removeEventListener('keydown', escape) }
  }, [gl, view.placement, view.walk])
  const floor = (event: ThreeEvent<PointerEvent | MouseEvent>, commit = false) => {
    const point = event.ray.intersectPlane(plane, new Vector3())
    if (!point) return
    event.stopPropagation()
    if (commit && event.delta <= 4) placeLearningAsset(point.x, point.z)
    else setHover(snapLearningPosition(point.x, point.z))
  }
  return <group>
    <LearningWalkCamera lesson={lesson} />
    {view.placement && <mesh position={[0, 7.5, 0]} rotation={[-Math.PI / 2, 0, 0]} onPointerMove={event => floor(event)} onClick={event => floor(event, true)}>
      <planeGeometry args={[120, 80]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} side={2} />
    </mesh>}
    {preview && <mesh position={[preview.position[0], preview.size[1] / 2, preview.position[2]]} raycast={() => {}}>
      <boxGeometry args={[...preview.size]} /><meshStandardMaterial color={issue ? '#dc635a' : '#42bdab'} transparent opacity={.4} depthWrite={false} wireframe />
    </mesh>}
    {view.placed.map(asset => <group key={asset.id} name={asset.id} position={[...asset.position]} onClick={event => {
      if (view.placement || event.delta > 4) return; event.stopPropagation(); update({ selectedId: asset.id })
    }}>
      {asset.templateId.startsWith('rack-') ? <WarehouseRack width={asset.size[0]} height={asset.size[1]} depth={asset.size[2]} /> : <PalletLoad width={asset.size[0]} height={asset.size[1]} depth={asset.size[2]} />}
    </group>)}
    {WAREHOUSE_DOORS.map(door => <group key={door.id} position={[door.x - door.width / 2, 0, door.z]}>
      {[-.06, door.width + .06].map(x => <mesh key={x} position={[x, 1.25, 0]} castShadow><boxGeometry args={[.12, 2.5, .18]} /><meshStandardMaterial color="#6b8190" metalness={.4} /></mesh>)}
      <mesh position={[door.width / 2, 2.5, 0]}><boxGeometry args={[door.width + .24, .12, .18]} /><meshStandardMaterial color="#6b8190" /></mesh>
      <group rotation={[0, view.doors.includes(door.id) ? -Math.PI / 2 : 0, 0]} onClick={event => {
        if (view.placement || event.delta > 4) return; event.stopPropagation(); toggleWarehouseDoor(door.id)
      }}>
        <mesh position={[door.width / 2, 1.22, 0]} castShadow><boxGeometry args={[door.width, 2.44, .08]} /><meshStandardMaterial color={view.doors.includes(door.id) ? '#719e92' : '#839cab'} roughness={.5} metalness={.25} /></mesh>
        <mesh position={[door.width - .16, 1.08, .075]}><boxGeometry args={[.19, .04, .07]} /><meshStandardMaterial color="#d7e3e6" metalness={.8} /></mesh>
        <mesh position={[door.width / 2, 1.85, -.045]}><boxGeometry args={[door.width * .65, .5, .015]} /><meshStandardMaterial color="#b8dde7" metalness={.2} roughness={.2} /></mesh>
      </group>
    </group>)}
  </group>
}
