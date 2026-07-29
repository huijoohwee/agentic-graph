import { useGraphStore } from '@/hooks/useGraphStore'
import {
  parseMarkdownFrontmatter,
  splitMarkdownLines,
} from '@/lib/markdown'
import {
  readXrMotionReferencePlan,
  serializeXrMotionReferencePlan,
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  XR_MOTION_REFERENCE_SCHEMA,
  xrMotionReferenceSceneKey,
} from '@/features/three/xrMotionReferenceModel'
import {
  XR_MOTION_REFERENCE_STAGE_PRESETS,
  isXrSceneLibraryAssetId,
} from '@/features/three/xrSceneLibrary'
import {
  hydrateXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import {
  resolveXrMotionReferencePersistedValue,
} from '@/features/three/xrMotionReferencePersistedValue'
import {
  resetCameraFramingRuntimeForDocument,
} from '@/features/strybldr/cameraFramingRuntime'
import {
  loadXrPhysicsDemoSeedSource,
} from '@/features/workspace-fs/xrPhysicsDemoSeedSource'
import {
  diagnoseWorkspaceRunReadyDemoActivation,
  FLIGHT_SIM_RUN_READY_DEMO_ID,
  XR_PHYSICS_DEMO_REPO_REL_PATH,
  XR_PHYSICS_RUN_READY_DEMO_ID,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import type { GraphData, GraphNode } from '@/lib/graph/types'

export const FLIGHT_SIM_SHARED_XR_SOURCE_AUTHORITY =
  `/${XR_PHYSICS_DEMO_REPO_REL_PATH}` as const

type SharedXrSourceResolution =
  | Readonly<{
      authority: 'active-document' | 'physics-source'
      ok: true
      persistedValue: unknown
    }>
  | Readonly<{
      error: string
      ok: false
    }>

type CanonicalFlightXrSourceResolution =
  | Readonly<{
      applies: false
    }>
  | Readonly<{
      applies: true
      ok: true
      persistedValue: unknown
    }>
  | Readonly<{
      applies: true
      error: string
      ok: false
    }>

type CachedFlightXrSource = Readonly<{
  documentName: string
  documentText: string
  persistedValue: unknown
  sceneKey: string
}>

let cachedPhysicsSource: CachedFlightXrSource | null = null

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readFrontmatter(source: string): Readonly<{
  meta: Record<string, unknown>
  warnings: readonly string[]
}> {
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(source))
  return Object.freeze({
    meta: parsed.meta,
    warnings: Object.freeze([...parsed.warnings]),
  })
}

function isFiniteVector(value: unknown): boolean {
  return Array.isArray(value)
    && value.length >= 3
    && value.slice(0, 3).every(entry => Number.isFinite(entry))
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue)
  const record = asRecord(value)
  if (!record) return value
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map(key => [key, canonicalJsonValue(record[key])]),
  )
}

function validateMotionReferencePlan(
  value: unknown,
  requireVehicleSubject = false,
  graphNodes: readonly GraphNode[] = [],
): string {
  const plan = asRecord(value)
  if (!plan || plan.schema !== XR_MOTION_REFERENCE_SCHEMA) {
    return 'The XR motion-reference plan schema is missing or invalid.'
  }
  if (
    typeof plan.stageId !== 'string'
    || !XR_MOTION_REFERENCE_STAGE_PRESETS.some(stage => stage.id === plan.stageId)
  ) {
    return 'The XR motion-reference plan stage is missing or invalid.'
  }
  if (
    !Number.isFinite(plan.durationSeconds)
    || Number(plan.durationSeconds) < 1
    || Number(plan.durationSeconds) > 30
    || !Number.isFinite(plan.fps)
    || Number(plan.fps) < 6
    || Number(plan.fps) > 30
  ) {
    return 'The XR motion-reference plan timing is invalid.'
  }
  if (
    !Array.isArray(plan.subjects)
    || !Array.isArray(plan.cast)
    || !Array.isArray(plan.camera)
  ) {
    return 'The XR motion-reference plan collections are missing or invalid.'
  }
  const subjectIds = new Set<string>()
  for (const valueSubject of plan.subjects) {
    const subject = asRecord(valueSubject)
    const subjectId = String(subject?.id || '').trim()
    if (
      !subject
      || !subjectId
      || subjectIds.has(subjectId)
      || !isXrSceneLibraryAssetId(subject.assetId)
      || !isFiniteVector(subject.position)
      || (subject.rotationYDegrees !== undefined
        && !Number.isFinite(subject.rotationYDegrees))
      || (subject.scale !== undefined
        && (!Number.isFinite(subject.scale) || Number(subject.scale) <= 0))
    ) {
      return 'The XR motion-reference plan contains an invalid subject.'
    }
    subjectIds.add(subjectId)
  }
  const castActorIds = new Set<string>()
  for (const valueTrack of plan.cast) {
    const track = asRecord(valueTrack)
    const actorId = String(track?.actorId || '').trim()
    if (
      !track
      || !actorId
      || castActorIds.has(actorId)
      || !Array.isArray(track.marks)
      || track.marks.some(valueMark => {
        const mark = asRecord(valueMark)
        return !mark
          || !Number.isFinite(mark.timeSeconds)
          || !isFiniteVector(mark.position)
      })
    ) {
      return 'The XR motion-reference plan contains an invalid cast track.'
    }
    castActorIds.add(actorId)
  }
  if (plan.camera.some(mark => !asRecord(mark))) {
    return 'The XR motion-reference plan contains an invalid camera mark.'
  }
  if (
    requireVehicleSubject
    && !plan.subjects.some(valueSubject => (
      String(asRecord(valueSubject)?.assetId || '').startsWith('vehicle-')
    ))
  ) {
    return 'The canonical Physics source must provide a vehicle subject.'
  }
  const normalized = serializeXrMotionReferencePlan(
    readXrMotionReferencePlan(value, graphNodes),
  )
  if (
    JSON.stringify(canonicalJsonValue(normalized))
      !== JSON.stringify(canonicalJsonValue(value))
  ) {
    return 'The XR motion-reference plan is not in canonical serialized form.'
  }
  return ''
}

function diagnoseFlightSource(
  documentName: string,
  documentText: string,
) {
  return diagnoseWorkspaceRunReadyDemoActivation(documentName, documentText)
}

export function isSourceAuthoredFlightSimDocument(
  documentName: string,
  documentText: string,
): boolean {
  const diagnostic = diagnoseFlightSource(documentName, documentText)
  return diagnostic.ok
    && diagnostic.id === FLIGHT_SIM_RUN_READY_DEMO_ID
    && diagnostic.sourceId === FLIGHT_SIM_RUN_READY_DEMO_ID
}

export function resolveFlightSimSharedXrMotionReferenceSource(args: Readonly<{
  activeGraphNodes?: readonly GraphNode[]
  activeDocumentName?: string
  activeDocumentText: string
  currentPersistedValue: unknown
  physicsSourceText: string
}>): SharedXrSourceResolution {
  const diagnostic = diagnoseFlightSource(
    args.activeDocumentName || '',
    args.activeDocumentText,
  )
  if (
    !diagnostic.ok
    || diagnostic.id !== FLIGHT_SIM_RUN_READY_DEMO_ID
    || diagnostic.sourceId !== FLIGHT_SIM_RUN_READY_DEMO_ID
  ) {
    return Object.freeze({
      error:
        'Only the source-authored Flight Sim document may resolve the shared XR source.',
      ok: false,
    })
  }
  if (args.currentPersistedValue !== undefined) {
    const validationError = validateMotionReferencePlan(
      args.currentPersistedValue,
      false,
      args.activeGraphNodes,
    )
    if (validationError) {
      return Object.freeze({
        error: `The active Flight Sim XR plan is invalid. ${validationError}`,
        ok: false,
      })
    }
    return Object.freeze({
      authority: 'active-document',
      ok: true,
      persistedValue: args.currentPersistedValue,
    })
  }
  const active = readFrontmatter(args.activeDocumentText)
  const sharedScene = asRecord(active.meta.shared_xr_scene)
  if (
    active.warnings.length > 0
    || sharedScene?.source_authority
      !== FLIGHT_SIM_SHARED_XR_SOURCE_AUTHORITY
  ) {
    return Object.freeze({
      error:
        'Flight Sim shared XR source authority is missing or invalid.',
      ok: false,
    })
  }
  const physics = readFrontmatter(args.physicsSourceText)
  const runReadyDemo = asRecord(physics.meta.run_ready_demo)
  const persistedValue =
    physics.meta[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]
  const physicsDiagnostic = diagnoseWorkspaceRunReadyDemoActivation(
    FLIGHT_SIM_SHARED_XR_SOURCE_AUTHORITY,
    args.physicsSourceText,
  )
  const validationError = validateMotionReferencePlan(persistedValue, true)
  if (
    physics.warnings.length > 0
    || runReadyDemo?.id !== XR_PHYSICS_RUN_READY_DEMO_ID
    || !physicsDiagnostic.ok
    || physicsDiagnostic.id !== XR_PHYSICS_RUN_READY_DEMO_ID
    || physicsDiagnostic.sourceId !== XR_PHYSICS_RUN_READY_DEMO_ID
    || validationError
  ) {
    return Object.freeze({
      error:
        `The canonical Physics source did not provide a valid XR motion-reference plan.${validationError ? ` ${validationError}` : ''}`,
      ok: false,
    })
  }
  return Object.freeze({
    authority: 'physics-source',
    ok: true,
    persistedValue,
  })
}

/**
 * The canonical XR controls are synchronous. They may consume only an explicit
 * valid Flight plan or a Physics plan verified for this exact document
 * identity by the async source loader below.
 */
export function resolveCanonicalFlightSimXrPersistedValue(args: Readonly<{
  activeDocumentName: string
  activeDocumentText: string
  currentPersistedValue: unknown
  graphData: GraphData | null
}>): CanonicalFlightXrSourceResolution {
  const diagnostic = diagnoseFlightSource(
    args.activeDocumentName,
    args.activeDocumentText,
  )
  if (
    diagnostic.pathId !== FLIGHT_SIM_RUN_READY_DEMO_ID
    && diagnostic.sourceId !== FLIGHT_SIM_RUN_READY_DEMO_ID
  ) {
    return Object.freeze({ applies: false as const })
  }
  if (diagnostic.ok === false) {
    return Object.freeze({
      applies: true as const,
      error: diagnostic.message,
      ok: false as const,
    })
  }
  if (
    diagnostic.id !== FLIGHT_SIM_RUN_READY_DEMO_ID
    || diagnostic.sourceId !== FLIGHT_SIM_RUN_READY_DEMO_ID
  ) {
    return Object.freeze({
      applies: true as const,
      error: 'The active Flight Sim source identity is invalid.',
      ok: false as const,
    })
  }
  if (args.currentPersistedValue !== undefined) {
    const validationError = validateMotionReferencePlan(
      args.currentPersistedValue,
      false,
      args.graphData?.nodes,
    )
    return validationError
      ? Object.freeze({
          applies: true as const,
          error: `The active Flight Sim XR plan is invalid. ${validationError}`,
          ok: false as const,
        })
      : Object.freeze({
          applies: true as const,
          ok: true as const,
          persistedValue: args.currentPersistedValue,
        })
  }
  const sceneKey = xrMotionReferenceSceneKey(
    args.activeDocumentName || 'Untitled',
    args.graphData,
  )
  if (
    cachedPhysicsSource?.sceneKey === sceneKey
    && cachedPhysicsSource.documentName === args.activeDocumentName
    && cachedPhysicsSource.documentText === args.activeDocumentText
  ) {
    return Object.freeze({
      applies: true as const,
      ok: true as const,
      persistedValue: cachedPhysicsSource.persistedValue,
    })
  }
  return Object.freeze({
    applies: true as const,
    error:
      'The declared Flight Sim Physics XR source has not been verified yet.',
    ok: false as const,
  })
}

/**
 * Flight owns an overlay, not a second XR scene. Resolve its declared Physics
 * source before launch so direct Flight activation and document handoffs use
 * the same authored subjects. An explicit plan on the active document,
 * including an intentionally empty one, always wins.
 */
export async function hydrateFlightSimSharedXrSceneSource(): Promise<boolean> {
  const initial = useGraphStore.getState()
  if (!isSourceAuthoredFlightSimDocument(
    initial.markdownDocumentName,
    initial.markdownDocumentText,
  )) {
    return false
  }
  const initialDocumentName = initial.markdownDocumentName
  const initialDocumentText = initial.markdownDocumentText
  const initialSceneKey = xrMotionReferenceSceneKey(
    initialDocumentName || 'Untitled',
    initial.graphData,
  )
  const initialPersistedValue =
    resolveXrMotionReferencePersistedValue(initial.graphData?.metadata)
  const physicsSourceText = initialPersistedValue === undefined
    ? await loadXrPhysicsDemoSeedSource()
    : ''
  const current = useGraphStore.getState()
  if (
    current.markdownDocumentName !== initialDocumentName
    || current.markdownDocumentText !== initialDocumentText
    || xrMotionReferenceSceneKey(
      current.markdownDocumentName || 'Untitled',
      current.graphData,
    ) !== initialSceneKey
    || !isSourceAuthoredFlightSimDocument(
      current.markdownDocumentName,
      current.markdownDocumentText,
    )
  ) {
    return false
  }
  const resolution = resolveFlightSimSharedXrMotionReferenceSource({
    activeGraphNodes: current.graphData?.nodes,
    activeDocumentName: current.markdownDocumentName,
    activeDocumentText: current.markdownDocumentText,
    currentPersistedValue:
      resolveXrMotionReferencePersistedValue(current.graphData?.metadata),
    physicsSourceText,
  })
  if (resolution.ok === false) throw new Error(resolution.error)
  const sceneKey = xrMotionReferenceSceneKey(
    current.markdownDocumentName || 'Untitled',
    current.graphData,
  )
  if (resolution.authority === 'physics-source') {
    cachedPhysicsSource = Object.freeze({
      documentName: current.markdownDocumentName,
      documentText: current.markdownDocumentText,
      persistedValue: resolution.persistedValue,
      sceneKey,
    })
  }
  resetCameraFramingRuntimeForDocument(sceneKey)
  hydrateXrMotionReferenceRuntime({
    sceneKey,
    nodes: current.graphData?.nodes || [],
    persistedValue: resolution.persistedValue,
  })
  return true
}
