import { allocateEntity, createWorld, registerComponent, disposeWorld, snapshotWorld } from '../../../../ecs/world.js'
import { worldTick } from '../../../../ecs/worldTick.js'
import { SpatialPhysicsEngine } from '../physics/spatialPhysicsEngine'
import { numeric, integer } from './pythonValues'
import { PYTHON_LIMITS, PythonLearningError, type PyValue, type SourceSpan } from './pythonModel'
import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'

type TickContext = { write: (id: number, component: string, field: string, value: number) => void }
export class LearningSimulation {
  private readonly physics: SpatialPhysicsEngine
  private readonly world: object
  private x = 0
  private z = 0
  private heading = 0
  private altitude = 0
  private maxAltitude = 0
  private hoverTicks = 0
  private ticks = 0
  private collisions = 0
  private disposed = false
  readonly trace: Array<readonly number[]> = []
  constructor(readonly lesson: LearningLesson, private readonly onTick: () => Promise<void> = async () => {}) {
    const obstacles = [...lesson.obstacles,
      { id: 'boundary-east', position: [8, 0] as const, size: [0.2, 16] as const },
      { id: 'boundary-west', position: [-8, 0] as const, size: [0.2, 16] as const },
      { id: 'boundary-north', position: [0, 8] as const, size: [16, 0.2] as const },
      { id: 'boundary-south', position: [0, -8] as const, size: [16, 0.2] as const },
    ]
    const halfHeight = (id: string) => lesson.vehicle === 'drone' && id.startsWith('boundary-') ? 3 : 0.5
    this.physics = new SpatialPhysicsEngine({ fixedStepSeconds: 1 / 60, maxSubSteps: 1, gravity: [0, 0, 0],
      bodies: [{ id: 'learner', motion: 'kinematic', position: [0, 0.25, 0] }, ...obstacles.map(o => ({ id: o.id, motion: 'static' as const, position: [o.position[0], halfHeight(o.id), o.position[1]] as const }))],
      colliders: [{ id: 'learner-body', bodyId: 'learner', shape: { kind: 'sphere', radius: 0.2 } }, ...obstacles.map(o => ({ id: o.id, bodyId: o.id, shape: { kind: 'cuboid' as const, halfSize: [o.size[0] / 2, halfHeight(o.id), o.size[1] / 2] as const } }))],
    })
    const system = (context: TickContext) => {
      for (const [field, value] of Object.entries({ x: this.x, z: this.z, heading: this.heading, ticks: this.ticks, collisions: this.collisions })) context.write(0, 'LearningPose', field, value)
    }
    this.world = createWorld({ systems: [system], reasoningPolicy: 'forbid' })
    registerComponent(this.world, 'LearningPose', { x: 'f64', z: 'f64', heading: 'f64', ticks: 'u32', collisions: 'u32' })
    allocateEntity(this.world, { entityRef: 'learning:subject', components: { LearningPose: { x: 0, z: 0, heading: 0, ticks: 0, collisions: 0 } } })
  }
  snapshot(): LearningSceneSnapshot {
    if (this.disposed) throw new Error('Learning World was disposed.')
    const angle = this.heading * Math.PI / 180
    const hit = this.physics.castRay({ origin: [this.x, 0.25 + this.altitude, this.z], direction: [Math.cos(angle), 0, Math.sin(angle)], maxDistance: 20, filter: { excludeColliderIds: ['learner-body'] } })[0]
    return { x: this.x, z: this.z, heading: this.heading, ticks: this.ticks, collisions: this.collisions,
      atGoal: Math.hypot(this.x - this.lesson.goal[0], this.z - this.lesson.goal[1]) <= 0.25 && this.altitude === 0,
      distance: Math.max(0, (hit?.distance ?? 20) - 0.2),
      ...(this.lesson.vehicle === 'drone' ? { altitude: this.altitude, maxAltitude: this.maxAltitude, hoverTicks: this.hoverTicks, landed: this.altitude === 0 } : {}) }
  }
  inspectWorld(): unknown { return snapshotWorld(this.world) }
  async call(name: string, args: PyValue[], span: SourceSpan): Promise<PyValue> {
    if (this.disposed) throw new PythonLearningError('cancelled', 'Learning World is disposed.', span)
    if (['takeoff', 'fly', 'hover', 'land', 'altitude'].includes(name)) return this.droneCall(name, args, span)
    const arity = name === 'drive' ? 2 : name === 'turn' ? 1 : 0
    if (args.length !== arity) throw new PythonLearningError('runtime-error', `${name} expects ${arity} arguments.`, span)
    if (name === 'distance') return { kind: 'float', value: this.snapshot().distance }
    if (name === 'at_goal') return this.snapshot().atGoal
    if (name === 'turn') {
      const degrees = numeric(args[0], span)
      if (!Number.isFinite(degrees) || Math.abs(degrees) > 360) throw new PythonLearningError('invalid-input', 'turn accepts degrees from -360 to 360.', span)
      this.heading = ((this.heading + degrees) % 360 + 360) % 360
      const tick = await worldTick(this.world, {})
      if (!tick.ok) throw new PythonLearningError('runtime-error', tick.message, span)
      return null
    }
    if (name !== 'drive') throw new PythonLearningError('runtime-error', `Unknown capability: ${name}`, span)
    if (this.lesson.vehicle === 'drone') throw new PythonLearningError('invalid-input', 'Use takeoff and fly in the drone lesson; drive is for ground vehicles.', span)
    const speed = numeric(args[0], span), count = integer(args[1], span)
    if (!Number.isFinite(speed) || Math.abs(speed) > 6 || count < 1n || count > 3600n) throw new PythonLearningError('invalid-input', 'drive accepts speed -6..6 m/s and 1..3600 integer ticks.', span)
    if (this.ticks + Number(count) > PYTHON_LIMITS.ticks) throw new PythonLearningError('limit-exceeded', 'Simulation exceeds 7,200 ticks.', span)
    const angle = this.heading * Math.PI / 180
    for (let i = 0; i < Number(count); i++) {
      const x = this.x + Math.cos(angle) * speed / 60, z = this.z + Math.sin(angle) * speed / 60
      const blocked = this.physics.queryOverlap({ position: [x, 0.25, z], shape: { kind: 'sphere', radius: 0.2 }, filter: { excludeColliderIds: ['learner-body'], includeSensors: false } }).length > 0
      if (blocked) this.collisions++
      else { this.x = x; this.z = z }
      this.physics.setBodyPose('learner', [this.x, 0.25, this.z]); this.physics.stepFixed(); this.physics.drainEvents()
      this.ticks++
      const tick = await worldTick(this.world, {})
      if (!tick.ok) throw new PythonLearningError('runtime-error', tick.message, span)
      this.trace.push([this.ticks, this.x, this.z, this.heading])
      await this.onTick()
    }
    return null
  }
  private async droneCall(name: string, args: PyValue[], span: SourceSpan): Promise<PyValue> {
    const invalid = (message: string): never => { throw new PythonLearningError('invalid-input', message, span) }
    if (this.lesson.vehicle !== 'drone') return invalid('Drone commands require the drone lesson.')
    const arity = name === 'fly' ? 4 : name === 'takeoff' || name === 'hover' ? 1 : 0
    if (args.length !== arity) return invalid(`${name} expects ${arity} arguments.`)
    if (name === 'altitude') return { kind: 'float', value: this.altitude }
    let count = 0, dx = 0, dy = 0, dz = 0
    if (name === 'takeoff' || name === 'land') {
      const target = name === 'land' ? 0 : numeric(args[0], span)
      if (name === 'takeoff' && (this.altitude !== 0 || !Number.isFinite(target) || target < 0.25 || target > 4)) return invalid('takeoff requires a landed drone and altitude 0.25..4 metres.')
      count = Math.ceil(Math.abs(target - this.altitude) * 60)
      if (count === 0) return null
      dy = (target - this.altitude) / count
    } else {
      if (this.altitude === 0) return invalid('Take off before flying or hovering.')
      const ticks = integer(args[name === 'fly' ? 3 : 0], span)
      if (ticks < 1n || ticks > 3600n) return invalid(`${name} accepts 1..3600 integer ticks.`)
      count = Number(ticks)
      if (name === 'fly') {
        const [forward, right, up] = args.slice(0, 3).map(value => numeric(value, span))
        if (![forward, right, up].every(Number.isFinite) || Math.hypot(forward, right, up) > 3) return invalid('fly accepts a combined speed of at most 3 m/s.')
        const angle = this.heading * Math.PI / 180
        dx = (Math.cos(angle) * forward - Math.sin(angle) * right) / 60
        dz = (Math.sin(angle) * forward + Math.cos(angle) * right) / 60
        dy = up / 60
      }
    }
    const requestedAltitude = this.altitude + dy * count
    if (requestedAltitude < -1e-9 || requestedAltitude > 4 + 1e-9) return invalid('Flight would leave the 0..4 metre altitude range.')
    if (this.ticks + count > PYTHON_LIMITS.ticks) throw new PythonLearningError('limit-exceeded', 'Simulation exceeds 7,200 ticks.', span)
    for (let tick = 0; tick < count; tick++) {
      if (this.disposed) throw new PythonLearningError('cancelled', 'Learning World is disposed.', span)
      const x = this.x + dx, z = this.z + dz
      const altitude = Math.abs(this.altitude + dy) < 1e-9 ? 0 : Math.min(4, this.altitude + dy)
      const blocked = this.physics.queryOverlap({ position: [x, 0.25 + altitude, z], shape: { kind: 'sphere', radius: 0.2 }, filter: { excludeColliderIds: ['learner-body'], includeSensors: false } }).length > 0
      if (blocked) this.collisions++
      else { this.x = x; this.z = z; this.altitude = altitude; this.maxAltitude = Math.max(this.maxAltitude, altitude) }
      if (name === 'hover' && !blocked && this.altitude > 0) this.hoverTicks++
      this.physics.setBodyPose('learner', [this.x, 0.25 + this.altitude, this.z]); this.physics.stepFixed(); this.physics.drainEvents()
      this.ticks++
      const result = await worldTick(this.world, {})
      if (!result.ok) throw new PythonLearningError('runtime-error', result.message, span)
      this.trace.push([this.ticks, this.x, this.z, this.heading, this.altitude])
      await this.onTick()
    }
    return null
  }
  dispose(): void { if (!this.disposed) { this.disposed = true; disposeWorld(this.world) } }
}
