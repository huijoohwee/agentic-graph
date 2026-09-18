import {
  XR_SCENE_INVOCATION_BINDINGS,
  XR_SCENE_INVOCATION_COMMANDS,
  XR_SCENE_INVOCATION_SEMANTICS,
} from './xrSceneMcpContract.mjs'
import { XR_PHYSICS_COLLISION_BITFIELD_MAX } from './xrPhysicsModel'

export type XrPhysicsScope = 'world' | 'body' | 'impulse' | 'controller'
export type XrPhysicsOperation = 'play' | 'pause' | 'stop' | 'reset' | 'step' | 'configure' | 'attach' | 'detach' | 'impulse' | 'develop-run' | 'resume' | 'exit' | 'select'
export type XrPhysicsBodyMode = 'static' | 'dynamic' | 'kinematic' | 'trigger'
export type XrPhysicsControllerMode = 'ball' | 'rocket'
export type XrInteractiveVector = readonly [number, number, number]

export type XrPhysicsControlInput = Readonly<{
  scope: XrPhysicsScope
  operation: XrPhysicsOperation
  subjectId?: string
  bodyMode?: XrPhysicsBodyMode
  massKg?: number
  friction?: number
  restitution?: number
  linearDamping?: number
  collisionGroup?: number
  collisionMask?: number
  gravity?: XrInteractiveVector
  fixedStepSeconds?: number
  maxSubsteps?: number
  impulse?: XrInteractiveVector
  ticks?: number
  controllerMode?: XrPhysicsControllerMode
}>

export type XrInteractiveInvocation = Readonly<{
  action: 'physics'
  physics: XrPhysicsControlInput
  invocation: string
}> | Readonly<{
  action: 'present'
  invocation: string
}>

const BODY_MODES = new Set<XrPhysicsBodyMode>(['static', 'dynamic', 'kinematic', 'trigger'])
const WORLD_OPERATIONS = new Set<XrPhysicsOperation>(['play', 'pause', 'stop', 'reset', 'step', 'configure'])
const BODY_OPERATIONS = new Set<XrPhysicsOperation>(['attach', 'configure', 'detach'])
const IMPULSE_OPERATIONS = new Set<XrPhysicsOperation>(['impulse'])
const CONTROLLER_OPERATIONS = new Set<XrPhysicsOperation>(['develop-run', 'pause', 'resume', 'reset', 'exit', 'select', 'step'])
const BODY_PROPERTY_KEYS = Object.freeze([
  'bodyMode',
  'massKg',
  'friction',
  'restitution',
  'linearDamping',
  'collisionGroup',
  'collisionMask',
] as const)
const WORLD_CONFIGURE_KEYS = new Set(['scope', 'operation', 'gravity', 'fixedStepSeconds', 'maxSubsteps'])
const BODY_CONFIGURE_KEYS = new Set(['scope', 'operation', 'subjectId', ...BODY_PROPERTY_KEYS])
const CONTROLLER_KEYS = new Set(['scope', 'operation', 'controllerMode'])

const OPERATION_KEYS: Readonly<Record<XrPhysicsOperation, ReadonlySet<string>>> = Object.freeze({
  play: new Set(['scope', 'operation']),
  pause: new Set(['scope', 'operation']),
  stop: new Set(['scope', 'operation']),
  reset: new Set(['scope', 'operation']),
  step: new Set(['scope', 'operation', 'ticks']),
  configure: new Set([...WORLD_CONFIGURE_KEYS, ...BODY_CONFIGURE_KEYS]),
  attach: new Set(['scope', 'operation', 'subjectId', ...BODY_PROPERTY_KEYS]),
  detach: new Set(['scope', 'operation', 'subjectId']),
  impulse: new Set(['scope', 'operation', 'subjectId', 'impulse']),
  'develop-run': CONTROLLER_KEYS,
  resume: new Set(['scope', 'operation']),
  exit: new Set(['scope', 'operation']),
  select: CONTROLLER_KEYS,
})

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function finite(
  value: unknown,
  min: number,
  max: number,
  integer = false,
  coerceString = false,
): number | undefined {
  if (value === undefined) return undefined
  const parsed = typeof value === 'number'
    ? value
    : coerceString && typeof value === 'string' && value.trim()
      ? Number(value.trim())
      : Number.NaN
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) return Number.NaN
  return parsed
}

function vector(value: unknown, min: number, max: number, coerceString = false): XrInteractiveVector | undefined {
  if (value === undefined) return undefined
  const parts = Array.isArray(value)
    ? value
    : coerceString && typeof value === 'string'
      ? value.split(',')
      : []
  if (parts.length !== 3) return undefined
  const parsed = parts.map(part => finite(part, min, max, false, coerceString))
  if (parsed.some(part => part === undefined || Number.isNaN(part))) return undefined
  return Object.freeze(parsed as [number, number, number])
}

function subjectId(value: unknown): string | null {
  if (value === undefined) return ''
  if (typeof value !== 'string') return null
  if (Array.from(value).length > 160) return null
  return value.trim()
}

function decodedInvocationSubjectId(value: string): string {
  try {
    return subjectId(decodeURIComponent(value)) || ''
  } catch {
    return ''
  }
}

function parsePairs(tokens: readonly string[], allowed: ReadonlySet<string>): Record<string, string> | null {
  const pairs: Record<string, string> = {}
  for (const token of tokens) {
    const separator = token.indexOf('=')
    if (separator <= 0 || separator === token.length - 1) return null
    const key = token.slice(0, separator)
    if (!allowed.has(key) || Object.hasOwn(pairs, key)) return null
    pairs[key] = token.slice(separator + 1)
  }
  return pairs
}

function normalizePhysics(value: unknown, coerceInvocationValues = false): XrPhysicsControlInput | null {
  const source = record(value)
  const scope = (typeof source.scope === 'string'
    ? coerceInvocationValues ? source.scope.trim() : source.scope
    : '') as XrPhysicsScope
  const operation = (typeof source.operation === 'string'
    ? coerceInvocationValues ? source.operation.trim() : source.operation
    : '') as XrPhysicsOperation
  const allowedOperations = scope === 'world' ? WORLD_OPERATIONS : scope === 'body' ? BODY_OPERATIONS : scope === 'impulse' ? IMPULSE_OPERATIONS : scope === 'controller' ? CONTROLLER_OPERATIONS : null
  if (!allowedOperations?.has(operation)) return null
  const allowedKeys = operation === 'configure'
    ? scope === 'world' ? WORLD_CONFIGURE_KEYS : BODY_CONFIGURE_KEYS
    : OPERATION_KEYS[operation]
  if (!allowedKeys || Object.keys(source).some(key => !allowedKeys.has(key))) return null
  const normalizedSubjectId = subjectId(source.subjectId)
  if (normalizedSubjectId === null) return null
  const bodyMode = (typeof source.bodyMode === 'string'
    ? coerceInvocationValues ? source.bodyMode.trim() : source.bodyMode
    : '') as XrPhysicsBodyMode
  if (source.bodyMode !== undefined && !bodyMode) return null
  if ((scope === 'body' || scope === 'impulse') && !normalizedSubjectId) return null
  if (bodyMode && !BODY_MODES.has(bodyMode)) return null
  if (scope === 'body' && operation === 'attach' && !bodyMode) return null
  const controllerMode = typeof source.controllerMode === 'string'
    ? (coerceInvocationValues ? source.controllerMode.trim() : source.controllerMode) as XrPhysicsControllerMode
    : undefined
  if (controllerMode !== undefined && controllerMode !== 'ball' && controllerMode !== 'rocket') return null
  if (scope === 'controller' && operation === 'select' && !controllerMode) return null
  const massKg = finite(source.massKg, 0.001, 10_000, false, coerceInvocationValues)
  const friction = finite(source.friction, 0, 1, false, coerceInvocationValues)
  const restitution = finite(source.restitution, 0, 1, false, coerceInvocationValues)
  const linearDamping = finite(source.linearDamping, 0, 20, false, coerceInvocationValues)
  const collisionGroup = finite(source.collisionGroup, 1, XR_PHYSICS_COLLISION_BITFIELD_MAX, true, coerceInvocationValues)
  const collisionMask = finite(source.collisionMask, 0, XR_PHYSICS_COLLISION_BITFIELD_MAX, true, coerceInvocationValues)
  const fixedStepSeconds = finite(source.fixedStepSeconds, 1 / 240, 1 / 30, false, coerceInvocationValues)
  const maxSubsteps = finite(source.maxSubsteps, 1, 8, true, coerceInvocationValues)
  const ticks = finite(source.ticks, 1, 240, true, coerceInvocationValues)
  const numeric = [massKg, friction, restitution, linearDamping, collisionGroup, collisionMask, fixedStepSeconds, maxSubsteps, ticks]
  if (numeric.some(item => Number.isNaN(item))) return null

  const gravity = vector(source.gravity, -100, 100, coerceInvocationValues)
  const impulse = vector(source.impulse, -10_000, 10_000, coerceInvocationValues)
  if (source.gravity !== undefined && !gravity) return null
  if (source.impulse !== undefined && !impulse) return null
  if (scope === 'impulse' && !impulse) return null
  if (scope !== 'world' && (gravity || fixedStepSeconds !== undefined || maxSubsteps !== undefined)) return null
  if (scope !== 'body' && (bodyMode || massKg !== undefined || friction !== undefined || restitution !== undefined || linearDamping !== undefined || collisionGroup !== undefined || collisionMask !== undefined)) return null
  if (scope !== 'impulse' && impulse) return null
  if (scope !== 'controller' && controllerMode !== undefined) return null
  if ((operation !== 'step' || (scope !== 'world' && scope !== 'controller')) && ticks !== undefined) return null
  if (scope === 'world' && operation === 'configure' && !gravity && fixedStepSeconds === undefined && maxSubsteps === undefined) return null
  if (scope === 'body' && operation === 'configure'
    && !bodyMode
    && massKg === undefined
    && friction === undefined
    && restitution === undefined
    && linearDamping === undefined
    && collisionGroup === undefined
    && collisionMask === undefined) return null

  return Object.freeze({
    scope,
    operation,
    ...(normalizedSubjectId ? { subjectId: normalizedSubjectId } : {}),
    ...(bodyMode ? { bodyMode } : {}),
    ...(massKg !== undefined ? { massKg } : {}),
    ...(friction !== undefined ? { friction } : {}),
    ...(restitution !== undefined ? { restitution } : {}),
    ...(linearDamping !== undefined ? { linearDamping } : {}),
    ...(collisionGroup !== undefined ? { collisionGroup } : {}),
    ...(collisionMask !== undefined ? { collisionMask } : {}),
    ...(gravity ? { gravity } : {}),
    ...(fixedStepSeconds !== undefined ? { fixedStepSeconds } : {}),
    ...(maxSubsteps !== undefined ? { maxSubsteps } : {}),
    ...(impulse ? { impulse } : {}),
    ...(ticks !== undefined ? { ticks } : {}),
    ...(controllerMode !== undefined ? { controllerMode } : {}),
  })
}

export function normalizeXrPhysicsControl(value: unknown): XrPhysicsControlInput | null {
  return normalizePhysics(value, false)
}

export function parseXrInteractiveInvocation(value: unknown): XrInteractiveInvocation | null {
  const invocation = String(value || '').trim()
  const tokens = invocation.split(/\s+/).filter(Boolean)
  const command = tokens[0]
  if (command === XR_SCENE_INVOCATION_COMMANDS.present) {
    if (tokens.length !== 3) return null
    const bindings = tokens.filter(token => token.startsWith('@'))
    const semantics = tokens.filter(token => token.startsWith('#'))
    if (bindings.length !== 1 || bindings[0] !== XR_SCENE_INVOCATION_BINDINGS.scene) return null
    if (semantics.length !== 1 || semantics[0] !== XR_SCENE_INVOCATION_SEMANTICS.reticle) return null
    return Object.freeze({ action: 'present', invocation })
  }
  if (command !== XR_SCENE_INVOCATION_COMMANDS.physics) return null
  if (tokens.slice(1).some(token => token.startsWith('/'))) return null
  const bindings = tokens.slice(1).filter(token => token.startsWith('@'))
  const semantics = tokens.slice(1).filter(token => token.startsWith('#'))
  if (bindings.length !== 1 || bindings[0] !== XR_SCENE_INVOCATION_BINDINGS.canvas || semantics.length !== 1) return null
  const scope = semantics[0] === XR_SCENE_INVOCATION_SEMANTICS.world
    ? 'world'
    : semantics[0] === XR_SCENE_INVOCATION_SEMANTICS.body
      ? 'body'
      : semantics[0] === XR_SCENE_INVOCATION_SEMANTICS.impulse
        ? 'impulse'
        : semantics[0] === XR_SCENE_INVOCATION_SEMANTICS.controller ? 'controller' : null
  if (!scope) return null
  const allowed = scope === 'world'
    ? new Set(['operation', 'gravity', 'fixedStep', 'maxSubsteps', 'ticks'])
    : scope === 'body'
      ? new Set(['operation', 'subject', 'mode', 'mass', 'friction', 'restitution', 'damping', 'group', 'mask'])
      : scope === 'impulse' ? new Set(['operation', 'subject', 'vector']) : new Set(['operation', 'mode', 'ticks'])
  const pairs = parsePairs(tokens.slice(1).filter(token => !token.startsWith('@') && !token.startsWith('#')), allowed)
  if (!pairs) return null
  const physics = normalizePhysics({
    scope,
    operation: pairs.operation,
    ...(pairs.subject !== undefined ? { subjectId: decodedInvocationSubjectId(pairs.subject) } : {}),
    ...(scope === 'body' && pairs.mode !== undefined ? { bodyMode: pairs.mode } : {}),
    ...(pairs.mass !== undefined ? { massKg: pairs.mass } : {}),
    ...(pairs.friction !== undefined ? { friction: pairs.friction } : {}),
    ...(pairs.restitution !== undefined ? { restitution: pairs.restitution } : {}),
    ...(pairs.damping !== undefined ? { linearDamping: pairs.damping } : {}),
    ...(pairs.group !== undefined ? { collisionGroup: pairs.group } : {}),
    ...(pairs.mask !== undefined ? { collisionMask: pairs.mask } : {}),
    ...(pairs.gravity !== undefined ? { gravity: pairs.gravity } : {}),
    ...(pairs.fixedStep !== undefined ? { fixedStepSeconds: pairs.fixedStep } : {}),
    ...(pairs.maxSubsteps !== undefined ? { maxSubsteps: pairs.maxSubsteps } : {}),
    ...(pairs.vector !== undefined ? { impulse: pairs.vector } : {}),
    ...(pairs.ticks !== undefined ? { ticks: pairs.ticks } : {}),
    ...(scope === 'controller' && pairs.mode !== undefined ? { controllerMode: pairs.mode } : {}),
  }, true)
  return physics ? Object.freeze({ action: 'physics', physics, invocation }) : null
}
