import React from 'react'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  XR_PHYSICS_BODY_MODES,
  XR_PHYSICS_COLLISION_BITFIELD_MAX,
  type XrPhysicsBodyMode,
} from '@/features/three/xrPhysicsModel'
import {
  readXrPhysicsRuntime,
  subscribeXrPhysicsRuntime,
} from '@/features/three/xrPhysicsRuntime'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import type { XrSceneControlInput } from '@/features/three/xrSceneMcpRuntime'
import type { XrPhysicsControlInput } from '@/features/three/xrSceneInteractiveInvocation'
import { selectBoundXrShotTarget } from '@/features/three/xrSelectedActorBinding'
import { XrV2AuthoringStatusPanel } from '@/features/xr-v2/XrV2AuthoringStatusPanel'
import { XrNativeControllerDemoControls } from './XrNativeControllerDemoControls'

type XrSimulationWorkbenchProps = Readonly<{
  sceneReady: boolean
  runControl: (input: XrSceneControlInput) => unknown
}>

type BodyDraft = Readonly<{
  mode: XrPhysicsBodyMode
  mass: string
  friction: string
  restitution: string
  damping: string
  collisionGroup: string
  collisionMask: string
}>

type WorldDraft = Readonly<{
  gravityY: string
  fixedRateHz: string
  maxSubsteps: string
}>

type VectorDraft = readonly [string, string, string]

const DEFAULT_BODY_DRAFT: BodyDraft = Object.freeze({
  mode: 'dynamic',
  mass: '1',
  friction: '0.55',
  restitution: '0.1',
  damping: '0.08',
  collisionGroup: '1',
  collisionMask: String(XR_PHYSICS_COLLISION_BITFIELD_MAX),
})

const DEFAULT_IMPULSE: VectorDraft = Object.freeze(['0', '2', '0'])

const BODY_MODE_LABELS: Readonly<Record<XrPhysicsBodyMode, string>> = Object.freeze({
  static: 'Static',
  dynamic: 'Dynamic',
  kinematic: 'Kinematic',
  trigger: 'Trigger',
})

function compactNumber(value: number): string {
  return Number(value.toFixed(6)).toString()
}

function boundedNumber(value: string, min: number, max: number): number | null {
  if (!String(value).trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function integerInRange(value: string, min: number, max: number): number | null {
  const parsed = boundedNumber(value, min, max)
  return parsed !== null && Number.isInteger(parsed) ? parsed : null
}

function bodyDraftFromRuntime(body: ReturnType<typeof readXrPhysicsRuntime>['world']['bodies'][number] | undefined): BodyDraft {
  if (!body) return DEFAULT_BODY_DRAFT
  return Object.freeze({
    mode: body.mode,
    mass: compactNumber(body.mass),
    friction: compactNumber(body.friction),
    restitution: compactNumber(body.restitution),
    damping: compactNumber(body.linearDamping),
    collisionGroup: String(body.collisionGroup),
    collisionMask: String(body.collisionMask),
  })
}

function worldDraftFromRuntime(runtime: ReturnType<typeof readXrPhysicsRuntime>): WorldDraft {
  return Object.freeze({
    gravityY: compactNumber(runtime.world.gravity[1]),
    fixedRateHz: compactNumber(1 / runtime.world.fixedStepSeconds),
    maxSubsteps: String(runtime.world.maxSubSteps),
  })
}

function NumericField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  marker,
  onChange,
}: {
  label: string
  value: string
  min: number
  max: number
  step: number
  disabled: boolean
  marker: string
  onChange: (value: string) => void
}) {
  return (
    <label className="grid min-w-0 gap-1 text-[10px]">
      <span className={UI_THEME_TOKENS.text.tertiary}>{label}</span>
      <PanelTextInput
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        data-kg-media-xr-simulation-field={marker}
      />
    </label>
  )
}

function WorkbenchButton({
  children,
  disabled,
  active = false,
  marker,
  onClick,
}: {
  children: React.ReactNode
  disabled: boolean
  active?: boolean
  marker: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn('App-toolbar__btn min-w-0 font-semibold', active ? UI_THEME_TOKENS.button.activeBg : '')}
      disabled={disabled}
      onClick={onClick}
      data-kg-media-xr-simulation-action={marker}
    >
      {children}
    </button>
  )
}

export function XrSimulationWorkbench({ sceneReady, runControl }: XrSimulationWorkbenchProps) {
  const physics = React.useSyncExternalStore(
    subscribeXrPhysicsRuntime,
    readXrPhysicsRuntime,
    readXrPhysicsRuntime,
  )
  const motion = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const subjects = motion.plan.subjects
  const preferredSubjectId = subjects.some(subject => subject.id === motion.selectedShotTargetId)
    ? motion.selectedShotTargetId
    : subjects[0]?.id || ''
  const [selectedSubjectId, setSelectedSubjectId] = React.useState(preferredSubjectId)
  const selectedSubject = subjects.find(subject => subject.id === selectedSubjectId) || null
  const selectedBody = physics.world.bodies.find(body => body.subjectId === selectedSubject?.id)
  const [bodyDraft, setBodyDraft] = React.useState<BodyDraft>(() => bodyDraftFromRuntime(selectedBody))
  const [worldDraft, setWorldDraft] = React.useState<WorldDraft>(() => worldDraftFromRuntime(physics))
  const [impulseDraft, setImpulseDraft] = React.useState<VectorDraft>(DEFAULT_IMPULSE)

  React.useEffect(() => {
    setSelectedSubjectId(current => {
      if (subjects.some(subject => subject.id === motion.selectedShotTargetId)) return motion.selectedShotTargetId
      return subjects.some(subject => subject.id === current) ? current : subjects[0]?.id || ''
    })
  }, [motion.selectedShotTargetId, subjects])

  React.useEffect(() => {
    setBodyDraft(bodyDraftFromRuntime(selectedBody))
  }, [selectedBody, selectedSubjectId])

  React.useEffect(() => {
    setWorldDraft(Object.freeze({
      gravityY: compactNumber(physics.world.gravity[1]),
      fixedRateHz: compactNumber(1 / physics.world.fixedStepSeconds),
      maxSubsteps: String(physics.world.maxSubSteps),
    }))
  }, [physics.world.fixedStepSeconds, physics.world.gravity, physics.world.maxSubSteps])

  const dispatchPhysics = React.useCallback((physicsInput: XrPhysicsControlInput) => {
    runControl({ action: 'physics', physics: physicsInput })
  }, [runControl])

  const bodyInput = React.useMemo(() => {
    const massKg = boundedNumber(bodyDraft.mass, 0.001, 10_000)
    const friction = boundedNumber(bodyDraft.friction, 0, 1)
    const restitution = boundedNumber(bodyDraft.restitution, 0, 1)
    const linearDamping = boundedNumber(bodyDraft.damping, 0, 20)
    const collisionGroup = integerInRange(bodyDraft.collisionGroup, 1, XR_PHYSICS_COLLISION_BITFIELD_MAX)
    const collisionMask = integerInRange(bodyDraft.collisionMask, 0, XR_PHYSICS_COLLISION_BITFIELD_MAX)
    if (!selectedSubject || massKg === null || friction === null || restitution === null || linearDamping === null || collisionGroup === null || collisionMask === null) return null
    return Object.freeze({
      subjectId: selectedSubject.id,
      bodyMode: bodyDraft.mode,
      massKg,
      friction,
      restitution,
      linearDamping,
      collisionGroup,
      collisionMask,
    })
  }, [bodyDraft, selectedSubject])

  const worldInput = React.useMemo(() => {
    const gravityY = boundedNumber(worldDraft.gravityY, -100, 100)
    const fixedRateHz = boundedNumber(worldDraft.fixedRateHz, 30, 240)
    const maxSubsteps = integerInRange(worldDraft.maxSubsteps, 1, 8)
    if (gravityY === null || fixedRateHz === null || maxSubsteps === null) return null
    return Object.freeze({
      gravity: [physics.world.gravity[0], gravityY, physics.world.gravity[2]] as const,
      fixedStepSeconds: 1 / fixedRateHz,
      maxSubsteps,
    })
  }, [physics.world.gravity, worldDraft])

  const impulse = React.useMemo(() => {
    const values = impulseDraft.map(value => boundedNumber(value, -10_000, 10_000))
    return values.some(value => value === null) ? null : values as [number, number, number]
  }, [impulseDraft])

  const stopped = physics.phase === 'stopped'
  const bodyEditingDisabled = !sceneReady || !selectedSubject || !stopped
  const bodyIsDynamic = selectedBody?.mode === 'dynamic'

  return (
    <section
      className={cn('grid min-w-0 gap-3 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
      aria-label="XR simulation workbench"
      data-kg-media-xr-simulation="1"
      data-kg-media-xr-simulation-phase={physics.phase}
    >
      <header className="flex items-start justify-between gap-2">
        <section className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase">Simulation</h3>
          <p className={cn('m-0 text-[10px]', UI_THEME_TOKENS.text.tertiary)}>
            Native rigid bodies, fixed-step playback, and authored reset poses.
          </p>
        </section>
        <output className={cn('shrink-0 text-right text-[9px] uppercase tracking-wide', UI_THEME_TOKENS.text.tertiary)}>
          {physics.phase}<br />{physics.world.bodies.length} bodies
        </output>
      </header>

      <XrNativeControllerDemoControls sceneReady={sceneReady} runControl={runControl} />
      <XrV2AuthoringStatusPanel sceneReady={sceneReady} />

      {!sceneReady ? (
        <p className="m-0 rounded bg-amber-100 px-2 py-1 text-[10px] text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">
          Open or create a graph document to configure the XR simulation.
        </p>
      ) : null}

      <section className="grid gap-2" aria-label="XR body component">
        <label className="grid gap-1 text-[10px]">
          <span className={UI_THEME_TOKENS.text.tertiary}>Placed subject</span>
          <PanelSelect
            value={selectedSubject?.id || ''}
            disabled={!subjects.length}
            onChange={event => {
              setSelectedSubjectId(event.target.value)
              selectBoundXrShotTarget(event.target.value)
            }}
            data-kg-media-xr-simulation-subject="1"
          >
            {!subjects.length ? <option value="">No placed subjects</option> : null}
            {subjects.map(subject => {
              const attached = physics.world.bodies.some(body => body.subjectId === subject.id)
              return <option key={subject.id} value={subject.id}>{subject.label}{attached ? ' · body' : ''}</option>
            })}
          </PanelSelect>
        </label>

        <label className="grid gap-1 text-[10px]">
          <span className={UI_THEME_TOKENS.text.tertiary}>Body mode</span>
          <PanelSelect
            value={bodyDraft.mode}
            disabled={bodyEditingDisabled}
            onChange={event => setBodyDraft(current => ({ ...current, mode: event.target.value as XrPhysicsBodyMode }))}
            data-kg-media-xr-simulation-body-mode="1"
          >
            {XR_PHYSICS_BODY_MODES.map(mode => <option key={mode} value={mode}>{BODY_MODE_LABELS[mode]}</option>)}
          </PanelSelect>
        </label>

        <section className="grid grid-cols-2 gap-2">
          <NumericField label="Mass (kg)" value={bodyDraft.mass} min={0.001} max={10_000} step={0.1} disabled={bodyEditingDisabled} marker="mass" onChange={value => setBodyDraft(current => ({ ...current, mass: value }))} />
          <NumericField label="Friction" value={bodyDraft.friction} min={0} max={1} step={0.05} disabled={bodyEditingDisabled} marker="friction" onChange={value => setBodyDraft(current => ({ ...current, friction: value }))} />
          <NumericField label="Restitution" value={bodyDraft.restitution} min={0} max={1} step={0.05} disabled={bodyEditingDisabled} marker="restitution" onChange={value => setBodyDraft(current => ({ ...current, restitution: value }))} />
          <NumericField label="Damping" value={bodyDraft.damping} min={0} max={20} step={0.05} disabled={bodyEditingDisabled} marker="damping" onChange={value => setBodyDraft(current => ({ ...current, damping: value }))} />
          <NumericField label="Collision group" value={bodyDraft.collisionGroup} min={1} max={XR_PHYSICS_COLLISION_BITFIELD_MAX} step={1} disabled={bodyEditingDisabled} marker="collision-group" onChange={value => setBodyDraft(current => ({ ...current, collisionGroup: value }))} />
          <NumericField label="Collision mask" value={bodyDraft.collisionMask} min={0} max={XR_PHYSICS_COLLISION_BITFIELD_MAX} step={1} disabled={bodyEditingDisabled} marker="collision-mask" onChange={value => setBodyDraft(current => ({ ...current, collisionMask: value }))} />
        </section>

        <section className="grid grid-cols-3 gap-1">
          <WorkbenchButton
            disabled={bodyEditingDisabled || Boolean(selectedBody) || !bodyInput}
            marker="attach"
            onClick={() => bodyInput && dispatchPhysics({ scope: 'body', operation: 'attach', ...bodyInput })}
          >
            Attach
          </WorkbenchButton>
          <WorkbenchButton
            disabled={bodyEditingDisabled || !selectedBody || !bodyInput}
            marker="configure-body"
            onClick={() => bodyInput && dispatchPhysics({ scope: 'body', operation: 'configure', ...bodyInput })}
          >
            Update
          </WorkbenchButton>
          <WorkbenchButton
            disabled={bodyEditingDisabled || !selectedBody}
            marker="detach"
            onClick={() => selectedSubject && dispatchPhysics({ scope: 'body', operation: 'detach', subjectId: selectedSubject.id })}
          >
            Detach
          </WorkbenchButton>
        </section>
      </section>

      <section className={cn('grid gap-2 border-t pt-2', UI_THEME_TOKENS.panel.border)} aria-label="XR world settings">
        <h4 className={cn('m-0 text-[10px] font-semibold uppercase', UI_THEME_TOKENS.text.secondary)}>World</h4>
        <section className="grid grid-cols-3 gap-2">
          <NumericField label="Gravity Y" value={worldDraft.gravityY} min={-100} max={100} step={0.1} disabled={!sceneReady || !stopped} marker="gravity-y" onChange={value => setWorldDraft(current => ({ ...current, gravityY: value }))} />
          <NumericField label="Fixed Hz" value={worldDraft.fixedRateHz} min={30} max={240} step={1} disabled={!sceneReady || !stopped} marker="fixed-rate" onChange={value => setWorldDraft(current => ({ ...current, fixedRateHz: value }))} />
          <NumericField label="Substeps" value={worldDraft.maxSubsteps} min={1} max={8} step={1} disabled={!sceneReady || !stopped} marker="substeps" onChange={value => setWorldDraft(current => ({ ...current, maxSubsteps: value }))} />
        </section>
        <WorkbenchButton
          disabled={!sceneReady || !stopped || !worldInput}
          marker="configure-world"
          onClick={() => worldInput && dispatchPhysics({ scope: 'world', operation: 'configure', ...worldInput })}
        >
          Apply world settings
        </WorkbenchButton>
      </section>

      <section className={cn('grid gap-2 border-t pt-2', UI_THEME_TOKENS.panel.border)} aria-label="XR simulation transport">
        <section className="grid grid-cols-5 gap-1">
          <WorkbenchButton disabled={!sceneReady || !physics.world.bodies.length || physics.phase === 'playing'} active={physics.phase === 'playing'} marker="play" onClick={() => dispatchPhysics({ scope: 'world', operation: 'play' })}>Play</WorkbenchButton>
          <WorkbenchButton disabled={!sceneReady || physics.phase !== 'playing'} active={physics.phase === 'paused'} marker="pause" onClick={() => dispatchPhysics({ scope: 'world', operation: 'pause' })}>Pause</WorkbenchButton>
          <WorkbenchButton disabled={!sceneReady || stopped} marker="step" onClick={() => dispatchPhysics({ scope: 'world', operation: 'step', ticks: 1 })}>Step</WorkbenchButton>
          <WorkbenchButton disabled={!sceneReady} marker="reset" onClick={() => dispatchPhysics({ scope: 'world', operation: 'reset' })}>Reset</WorkbenchButton>
          <WorkbenchButton disabled={!sceneReady || stopped} marker="stop" onClick={() => dispatchPhysics({ scope: 'world', operation: 'stop' })}>Stop</WorkbenchButton>
        </section>
      </section>

      <section className={cn('grid gap-2 border-t pt-2', UI_THEME_TOKENS.panel.border)} aria-label="XR body impulse">
        <section className="grid grid-cols-3 gap-2">
          {(['X', 'Y', 'Z'] as const).map((axis, index) => (
            <NumericField
              key={axis}
              label={`Impulse ${axis}`}
              value={impulseDraft[index]}
              min={-10_000}
              max={10_000}
              step={0.1}
              disabled={!sceneReady || !bodyIsDynamic || stopped}
              marker={`impulse-${axis.toLowerCase()}`}
              onChange={value => setImpulseDraft(current => current.map((entry, entryIndex) => entryIndex === index ? value : entry) as unknown as VectorDraft)}
            />
          ))}
        </section>
        <WorkbenchButton
          disabled={!sceneReady || !selectedSubject || !bodyIsDynamic || stopped || !impulse}
          marker="impulse"
          onClick={() => selectedSubject && impulse && dispatchPhysics({ scope: 'impulse', operation: 'impulse', subjectId: selectedSubject.id, impulse })}
        >
          Apply impulse
        </WorkbenchButton>
      </section>
    </section>
  )
}
