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
  private ticks = 0
  private collisions = 0
  private disposed = false
  readonly trace: Array<readonly [number, number, number, number]> = []
  constructor(readonly lesson: LearningLesson, private readonly onTick: () => Promise<void> = async () => {}) {
    const obstacles = [...lesson.obstacles,
      { id: 'boundary-east', position: [8, 0] as const, size: [0.2, 16] as const },
      { id: 'boundary-west', position: [-8, 0] as const, size: [0.2, 16] as const },
      { id: 'boundary-north', position: [0, 8] as const, size: [16, 0.2] as const },
      { id: 'boundary-south', position: [0, -8] as const, size: [16, 0.2] as const },
    ]
    this.physics = new SpatialPhysicsEngine({ fixedStepSeconds: 1 / 60, maxSubSteps: 1, gravity: [0, 0, 0],
      bodies: [{ id: 'learner', motion: 'kinematic', position: [0, 0.25, 0] }, ...obstacles.map(o => ({ id: o.id, motion: 'static' as const, position: [o.position[0], 0.5, o.position[1]] as const }))],
      colliders: [{ id: 'learner-body', bodyId: 'learner', shape: { kind: 'sphere', radius: 0.2 } }, ...obstacles.map(o => ({ id: o.id, bodyId: o.id, shape: { kind: 'cuboid' as const, halfSize: [o.size[0] / 2, 0.5, o.size[1] / 2] as const } }))],
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
    const hit = this.physics.castRay({ origin: [this.x, 0.25, this.z], direction: [Math.cos(angle), 0, Math.sin(angle)], maxDistance: 20, filter: { excludeColliderIds: ['learner-body'] } })[0]
    return { x: this.x, z: this.z, heading: this.heading, ticks: this.ticks, collisions: this.collisions,
      atGoal: Math.hypot(this.x - this.lesson.goal[0], this.z - this.lesson.goal[1]) <= 0.25,
      distance: Math.max(0, (hit?.distance ?? 20) - 0.2) }
  }
  inspectWorld(): unknown { return snapshotWorld(this.world) }
  async call(name: string, args: PyValue[], span: SourceSpan): Promise<PyValue> {
    if (this.disposed) throw new PythonLearningError('cancelled', 'Learning World is disposed.', span)
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
  dispose(): void { if (!this.disposed) { this.disposed = true; disposeWorld(this.world) } }
}
