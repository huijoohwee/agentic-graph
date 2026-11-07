import type { ExecutionMetrics } from './pythonEvaluator'
export type LearningLesson = Readonly<{
  id: string; revision: string; title: string; objective: string; starter: string; solution: string
  goal: readonly [number, number]; obstacles: readonly { id: string; name?: string; position: readonly [number, number]; size: readonly [number, number]; height?: number }[]
  hints: readonly string[]; concept: 'assignments' | 'loops' | 'functions'
  vehicle?: 'drone'
}>
export const LEARNING_LESSONS: readonly LearningLesson[] = [
  { id: 'travel', revision: '1', title: '1 · Variables in motion',
    objective: 'Move four metres along the blue axis to the green goal. A second is 60 ticks.',
    starter: 'speed = 2\nticks = 30\ndrive(speed, ticks)\nprint(at_goal())\n',
    solution: 'speed = 2\nticks = 120\ndrive(speed, ticks)\nprint(at_goal())\n',
    goal: [4, 0], obstacles: [], concept: 'assignments',
    hints: ['Distance is speed multiplied by time.', 'At 2 metres per second, four metres takes two seconds.', 'Try ticks = 120, keeping speed = 2.'],
  },
  { id: 'route', revision: '1', title: '2 · Repeat a route',
    objective: 'Reach the goal at (2, 2), going around the obstacle. Positive turns face the red axis.',
    starter: 'for leg in range(1):\n    drive(2, 60)\n    turn(90)\nprint(at_goal())\n',
    solution: 'for leg in range(2):\n    drive(2, 60)\n    turn(90)\nprint(at_goal())\n',
    goal: [2, 2], obstacles: [{ id: 'crate', position: [1, 1], size: [0.65, 0.65] }], concept: 'loops',
    hints: ['The first leg reaches (2, 0). The next turn points toward the goal.', 'Repeat the same move-and-turn procedure twice.', 'Use range(2) for two legs.'],
  },
  { id: 'sense', revision: '1', title: '3 · Sense, decide, act',
    objective: 'Write advance() using the forward distance sensor. Reach the goal without touching the wall.',
    starter: 'def advance():\n    return at_goal()\n\nfor attempt in range(8):\n    advance()\nprint(at_goal())\n',
    solution: 'def advance():\n    if distance() > 0.5:\n        drive(1, 30)\n    return at_goal()\n\nwhile not at_goal():\n    advance()\nprint(at_goal())\n',
    goal: [4, 0], obstacles: [{ id: 'wall', position: [6, 0], size: [0.5, 4] }], concept: 'functions',
    hints: ['distance() reads metres to the nearest obstacle ahead.', 'Only drive when there is room. Call your function until at_goal() is True.', 'Inside advance(), use if distance() > 0.5: followed by drive(1, 30).'],
  },
  { id: 'drone', revision: '2', title: '4 · Drone flight and landing', vehicle: 'drone',
    objective: 'Inspect the warehouse aisle: take off to 2 m, hover, pass above the pallet load, and land at (4, 0). Stay between the tall racks inside the 16 × 16 m inspection cell. Pre-programmed kinematic simulation; 60 ticks per second, altitude 0–4 m.',
    starter: 'def fly_leg():\n    return altitude()\n\ntakeoff(0.5)\nfly_leg()\nland()\nprint(at_goal())\n',
    solution: '# Warehouse inspection cell: X/Z -8..8 m, altitude 0..4 m.\n# Fixed aisle route; simulated flight only.\ndef fly_leg():\n    if altitude() >= 1:\n        fly(1, 0, 0, 120)\n\ntakeoff(2)\nhover(60)\nfor leg in range(2):\n    fly_leg()\nland()\nprint(at_goal())\n',
    goal: [4, 0], obstacles: [
      { id: 'crate', name: 'Pallet load', position: [2, 0], size: [0.8, 1.2], height: 1 },
      { id: 'rack-north', name: 'North pallet rack', position: [2, -2.4], size: [12, 1.2], height: 4.5 },
      { id: 'rack-south', name: 'South pallet rack', position: [2, 2.4], size: [12, 1.2], height: 4.5 },
    ], concept: 'functions',
    hints: ['The pallet load is one metre tall; the racks are 4.5 m tall. Take off above the load and stay in the 3.6 m clear aisle.', 'fly(forward, right, up, ticks) uses body-relative speeds. Keep right and up speeds at zero for this fixed aisle route; this exercise does not model the entire warehouse.', 'Take off to 2 m, hover for 60 ticks, fly forward at 1 m/s for 240 ticks, then land at (4, 0). The full simulation takes nine seconds.'],
  },
]
export function learningLesson(id: string): LearningLesson {
  const lesson = LEARNING_LESSONS.find(value => value.id === id)
  if (!lesson) throw new Error(`Unknown local lesson: ${id}`)
  return lesson
}
export type LearningSceneSnapshot = Readonly<{ x: number; z: number; heading: number; ticks: number; collisions: number; atGoal: boolean; distance: number
  altitude?: number; maxAltitude?: number; hoverTicks?: number; landed?: boolean }>
export function gradeLearningLesson(lesson: LearningLesson, state: LearningSceneSnapshot, metrics: ExecutionMetrics, completed: boolean) {
  const criteria = [
    { id: 'goal', label: lesson.vehicle === 'drone' ? 'Fly above 1 m, hover, and land at the goal' : 'Reach the marked goal', passed: state.atGoal && (lesson.vehicle !== 'drone' || (state.landed === true && (state.maxAltitude ?? 0) >= 1 && (state.hoverTicks ?? 0) >= 30)) },
    { id: 'collision', label: 'Avoid collisions', passed: state.collisions === 0 },
    { id: 'concept', label: `Use ${lesson.concept}${lesson.id === 'sense' || lesson.vehicle === 'drone' ? ' and a sensor condition' : ''}`, passed: metrics[lesson.concept] > 0 && (!(lesson.id === 'sense' || lesson.vehicle === 'drone') || (metrics.sensors > 0 && metrics.branches > 0)) },
    { id: 'complete', label: 'Finish within the execution limits', passed: completed },
  ]
  return { passed: criteria.every(c => c.passed), score: criteria.filter(c => c.passed).length / criteria.length, criteria }
}

export function learningSceneDescriptor(lessonId: string): string {
  const lesson = learningLesson(lessonId)
  return JSON.stringify({ lessonId, revision: lesson.revision, goal: lesson.goal, obstacles: lesson.obstacles, seed: 0, tickSeconds: 1 / 60, bounds: 8, radius: 0.2,
    ...(lesson.vehicle === 'drone' ? { vehicle: 'drone', model: 'bounded-kinematic-v1', altitudeBounds: [0, 4], traceColumns: ['tick', 'x', 'z', 'heading', 'altitude'] } : {}) })
}
