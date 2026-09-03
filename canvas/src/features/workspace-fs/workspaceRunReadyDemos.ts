import { readEnvString } from '@/lib/config.env'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { extractYamlFrontmatterHeaderBlock } from '@/lib/markdown/frontmatter'
import { hashStringToHexCached } from '@/lib/hash/textHashCache'

export const WORKSPACE_RUN_READY_DEMO_ENV = 'VITE_AGENTIC_OS_RUN_READY_DEMO'
export const CARE_AGENT_RUN_READY_DEMO_ID = 'care-agent'
export const CARE_AGENT_DEMO_WORKSPACE_SEED_BASENAME = 'agentic-graph-care-agent-demo.md'
export const RISK_COPILOT_RUN_READY_DEMO_ID = 'risk-copilot'
export const RISK_COPILOT_DEMO_WORKSPACE_SEED_BASENAME = 'agentic-graph-sme-care-agent-demo.md'
export const XR_PHYSICS_RUN_READY_DEMO_ID = 'xr-physics'
export const XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME = 'agentic-graph-physics-playground-demo.md'
export const XR_PHYSICS_DEMO_REPO_REL_PATH = `docs/workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
export const XR_PHYSICS_DEMO_PUBLISHED_CANONICAL_PATH = `agentic-canvas-os/${XR_PHYSICS_DEMO_REPO_REL_PATH}`
export const XR_V2_RUN_READY_DEMO_ID = 'xr-v2'
export const XR_V2_DEMO_WORKSPACE_SEED_BASENAME = 'agentic-graph-ar-vr-xr-runtime-readiness-demo.md'
export const XR_V2_DEMO_REPO_REL_PATH = `docs/workspace-seeds/${XR_V2_DEMO_WORKSPACE_SEED_BASENAME}`
export const FLIGHT_SIM_RUN_READY_DEMO_ID = 'flight-sim'
export const FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME = 'agentic-graph-game-flight-sim-demo.md'
export const FLIGHT_SIM_DEMO_REPO_REL_PATH = `docs/workspace-seeds/${FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME}`
export const CITY_SIM_RUN_READY_DEMO_ID = 'city-sim'
export const CITY_SIM_DEMO_WORKSPACE_SEED_BASENAME = 'agentic-graph-game-city-building-sim-demo.md'
export const CITY_SIM_DEMO_REPO_REL_PATH = `docs/workspace-seeds/${CITY_SIM_DEMO_WORKSPACE_SEED_BASENAME}`

export type WorkspaceRunReadyDemoSeed = {
  id: string
  label: string
  validationSeedRelPath: string
  seedRelPathCandidates: readonly string[]
  sourceRoot: 'huijoohwee/docs' | 'agentic-graph/docs'
  cleanCanvasRecommended: boolean
}

export type WorkspaceRunReadyDemoActivationDiagnostic =
  | Readonly<{
    ok: true
    id: string
    pathId: string
    sourceId: string | null
  }>
  | Readonly<{
    ok: false
    errorCode: 'RUN_READY_IDENTITY_CONFLICT' | 'RUN_READY_IDENTITY_UNREGISTERED'
    message: string
    pathId: string
    sourceId: string | null
  }>

const normalizeDemoId = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')

const RUN_READY_FRONTMATTER_CACHE_LIMIT = 48
const runReadyFrontmatterIdCache = new Map<string, string | null>()

export const WORKSPACE_RUN_READY_DEMO_SEEDS: readonly WorkspaceRunReadyDemoSeed[] = [
  {
    id: CARE_AGENT_RUN_READY_DEMO_ID,
    label: 'agentic-graph Care Agent Demo',
    validationSeedRelPath: CARE_AGENT_DEMO_WORKSPACE_SEED_BASENAME,
    seedRelPathCandidates: [
      `docs/workspace-seeds/${CARE_AGENT_DEMO_WORKSPACE_SEED_BASENAME}`,
      `docs/${CARE_AGENT_DEMO_WORKSPACE_SEED_BASENAME}`,
      CARE_AGENT_DEMO_WORKSPACE_SEED_BASENAME,
    ],
    sourceRoot: 'huijoohwee/docs',
    cleanCanvasRecommended: true,
  },
  {
    id: RISK_COPILOT_RUN_READY_DEMO_ID,
    label: 'agentic-graph SME Risk Copilot Demo',
    validationSeedRelPath: RISK_COPILOT_DEMO_WORKSPACE_SEED_BASENAME,
    seedRelPathCandidates: [
      `docs/workspace-seeds/${RISK_COPILOT_DEMO_WORKSPACE_SEED_BASENAME}`,
      `docs/${RISK_COPILOT_DEMO_WORKSPACE_SEED_BASENAME}`,
      RISK_COPILOT_DEMO_WORKSPACE_SEED_BASENAME,
    ],
    sourceRoot: 'huijoohwee/docs',
    cleanCanvasRecommended: true,
  },
  {
    id: XR_V2_RUN_READY_DEMO_ID,
    label: 'agentic-graph XR v2 Runtime-readiness Demo',
    validationSeedRelPath: XR_V2_DEMO_REPO_REL_PATH,
    seedRelPathCandidates: [XR_V2_DEMO_REPO_REL_PATH],
    sourceRoot: 'agentic-graph/docs',
    cleanCanvasRecommended: true,
  },
  {
    id: XR_PHYSICS_RUN_READY_DEMO_ID,
    label: 'agentic-graph Native XR Physics Demo',
    validationSeedRelPath: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
    seedRelPathCandidates: [XR_PHYSICS_DEMO_REPO_REL_PATH],
    sourceRoot: 'agentic-graph/docs',
    cleanCanvasRecommended: true,
  },
  {
    id: FLIGHT_SIM_RUN_READY_DEMO_ID,
    label: 'agentic-graph Local Flight Simulator',
    validationSeedRelPath: FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME,
    seedRelPathCandidates: [FLIGHT_SIM_DEMO_REPO_REL_PATH],
    sourceRoot: 'agentic-graph/docs',
    cleanCanvasRecommended: true,
  },
  {
    id: CITY_SIM_RUN_READY_DEMO_ID,
    label: 'agentic-graph Local City Simulator',
    validationSeedRelPath: CITY_SIM_DEMO_WORKSPACE_SEED_BASENAME,
    seedRelPathCandidates: [CITY_SIM_DEMO_REPO_REL_PATH],
    sourceRoot: 'agentic-graph/docs',
    cleanCanvasRecommended: true,
  },
]

export const resolveWorkspaceRunReadyDemoSeed = (demoId: string): WorkspaceRunReadyDemoSeed | null => {
  const normalized = normalizeDemoId(demoId)
  if (!normalized) return null
  return WORKSPACE_RUN_READY_DEMO_SEEDS.find(seed => seed.id === normalized) || null
}

export const resolveWorkspaceRunReadyDemoSeedRelPath = (demoId: string): string => (
  resolveWorkspaceRunReadyDemoSeed(demoId)?.validationSeedRelPath || ''
)

const normalizeWorkspaceDocumentPath = (value: string | null | undefined): string => (
  String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^workspace:/i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
)

export const resolveWorkspaceRunReadyDemoIdForDocumentPath = (
  documentPath: string | null | undefined,
): string => {
  const normalizedPath = normalizeWorkspaceDocumentPath(documentPath)
  if (!normalizedPath) return ''
  for (const seed of WORKSPACE_RUN_READY_DEMO_SEEDS) {
    const matches = seed.seedRelPathCandidates.some(candidate => (
      normalizeWorkspaceDocumentPath(candidate) === normalizedPath
    ))
    if (matches) return seed.id
  }
  return ''
}

function resolveWorkspaceRunReadyDemoIdForDocumentText(
  documentText: string | null | undefined,
): string | null {
  const block = extractYamlFrontmatterHeaderBlock(String(documentText || ''))
  if (!block) return null
  const cacheKey = hashStringToHexCached('workspace-run-ready-demo', block.rawBlock)
  if (runReadyFrontmatterIdCache.has(cacheKey)) {
    return runReadyFrontmatterIdCache.get(cacheKey) ?? null
  }
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(block.rawBlock))
  const declaration = parsed.meta.run_ready_demo
  let resolved: string | null = null
  if (declaration !== undefined) {
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
      resolved = ''
    } else {
      const requested = normalizeDemoId((declaration as Record<string, unknown>).id as string)
      resolved = resolveWorkspaceRunReadyDemoSeed(requested)?.id || ''
    }
  }
  runReadyFrontmatterIdCache.set(cacheKey, resolved)
  if (runReadyFrontmatterIdCache.size > RUN_READY_FRONTMATTER_CACHE_LIMIT) {
    const oldestKey = runReadyFrontmatterIdCache.keys().next().value
    if (typeof oldestKey === 'string') runReadyFrontmatterIdCache.delete(oldestKey)
  }
  return resolved
}

function readDeclaredWorkspaceRunReadyDemoId(
  documentText: string | null | undefined,
): string {
  const block = extractYamlFrontmatterHeaderBlock(String(documentText || ''))
  if (!block) return ''
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(block.rawBlock))
  const declaration = parsed.meta.run_ready_demo
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
    return ''
  }
  return normalizeDemoId(String((declaration as Record<string, unknown>).id || ''))
}

export const resolveWorkspaceRunReadyDemoIdForDocument = (
  documentPath: string | null | undefined,
  documentText: string | null | undefined,
): string => {
  const diagnostic = diagnoseWorkspaceRunReadyDemoActivation(documentPath, documentText)
  return diagnostic.ok ? diagnostic.id : ''
}

export const diagnoseWorkspaceRunReadyDemoActivation = (
  documentPath: string | null | undefined,
  documentText: string | null | undefined,
): WorkspaceRunReadyDemoActivationDiagnostic => {
  const pathId = resolveWorkspaceRunReadyDemoIdForDocumentPath(documentPath)
  const sourceId = resolveWorkspaceRunReadyDemoIdForDocumentText(documentText)
  if (sourceId == null) {
    if (pathId === CITY_SIM_RUN_READY_DEMO_ID) {
      return Object.freeze({
        ok: false,
        errorCode: 'RUN_READY_IDENTITY_UNREGISTERED',
        message: 'City run-ready activation requires source-authored identity: city-sim.',
        pathId,
        sourceId,
      })
    }
    if (pathId === XR_V2_RUN_READY_DEMO_ID) {
      return Object.freeze({
        ok: false,
        errorCode: 'RUN_READY_IDENTITY_UNREGISTERED',
        message: 'XR v2 run-ready activation requires source-authored identity: xr-v2.',
        pathId,
        sourceId,
      })
    }
    return pathId
      ? Object.freeze({ ok: true, id: pathId, pathId, sourceId })
      : Object.freeze({
        ok: false,
        errorCode: 'RUN_READY_IDENTITY_UNREGISTERED',
        message: 'Run-ready activation identity is unregistered: (missing).',
        pathId,
        sourceId,
      })
  }
  if (!sourceId) {
    const declaredId = readDeclaredWorkspaceRunReadyDemoId(documentText)
    return Object.freeze({
      ok: false,
      errorCode: 'RUN_READY_IDENTITY_UNREGISTERED',
      message: `Run-ready source-authored identity is unregistered: ${declaredId || '(invalid)'}.`,
      pathId,
      sourceId: declaredId || sourceId,
    })
  }
  if (pathId && pathId !== sourceId) {
    return Object.freeze({
      ok: false,
      errorCode: 'RUN_READY_IDENTITY_CONFLICT',
      message: `Run-ready identity conflict: imported path=${pathId}, source-authored=${sourceId}.`,
      pathId,
      sourceId,
    })
  }
  return Object.freeze({ ok: true, id: sourceId, pathId, sourceId })
}

export const readWorkspaceRunReadyDemoId = (
  documentPath?: string | null,
  documentText?: string | null,
): string => {
  const explicitlySelected = resolveWorkspaceRunReadyDemoSeed(
    readEnvString(WORKSPACE_RUN_READY_DEMO_ENV, ''),
  )
  if (explicitlySelected) return explicitlySelected.id
  return resolveWorkspaceRunReadyDemoIdForDocument(documentPath, documentText)
}

export const isXrPhysicsRunReadyDemoActive = (
  documentPath?: string | null,
  documentText?: string | null,
): boolean => {
  const id = readWorkspaceRunReadyDemoId(documentPath, documentText)
  // XR v2 shares the dedicated Physics-authored world/camera surface so the
  // generic session panel cannot become a second immersive-session owner.
  return id === XR_PHYSICS_RUN_READY_DEMO_ID || id === XR_V2_RUN_READY_DEMO_ID
}

export const isXrV2RunReadyDemoActive = (
  documentPath?: string | null,
  documentText?: string | null,
): boolean => {
  const diagnostic = diagnoseWorkspaceRunReadyDemoActivation(documentPath, documentText)
  return diagnostic.ok
    && diagnostic.id === XR_V2_RUN_READY_DEMO_ID
    && diagnostic.sourceId === XR_V2_RUN_READY_DEMO_ID
}

export const isFlightSimRunReadyDemoActive = (
  documentPath?: string | null,
  documentText?: string | null,
): boolean => (
  readWorkspaceRunReadyDemoId(documentPath, documentText) === FLIGHT_SIM_RUN_READY_DEMO_ID
)

export const isXrPhysicsRuntimeRunReadyDemoActive = (
  documentPath?: string | null,
  documentText?: string | null,
): boolean => {
  const id = readWorkspaceRunReadyDemoId(documentPath, documentText)
  return id === XR_PHYSICS_RUN_READY_DEMO_ID || id === FLIGHT_SIM_RUN_READY_DEMO_ID
}

export const isCitySimRunReadyDemoActive = (
  documentPath?: string | null,
  documentText?: string | null,
): boolean => {
  const diagnostic = diagnoseWorkspaceRunReadyDemoActivation(documentPath, documentText)
  return diagnostic.ok
    && diagnostic.id === CITY_SIM_RUN_READY_DEMO_ID
    && diagnostic.sourceId === CITY_SIM_RUN_READY_DEMO_ID
}

export const resolveWorkspaceRepoLocalRunReadyBootstrap = (args: {
  viteDev: boolean
  configuredValue: string
}): boolean => {
  if (args.viteDev) return true
  const value = args.configuredValue.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

export const isWorkspaceRepoLocalRunReadyBootstrap = (): boolean => {
  let viteDev = false
  try {
    viteDev = import.meta.env.DEV === true
  } catch {
    // Node-focused source tests do not expose Vite's import.meta.env object.
  }
  return resolveWorkspaceRepoLocalRunReadyBootstrap({
    viteDev,
    configuredValue: readEnvString('VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL', ''),
  })
}

export const resolveWorkspaceValidationSeedRelPath = (args: {
  explicitRelPath: string
  runReadyDemoId: string
  defaultRelPath: string
}): string => {
  const explicit = String(args.explicitRelPath || '').trim()
  if (explicit) return explicit
  const demoSeedRelPath = resolveWorkspaceRunReadyDemoSeedRelPath(args.runReadyDemoId)
  if (demoSeedRelPath) return demoSeedRelPath
  return String(args.defaultRelPath || '').trim()
}

export const readWorkspaceRunReadyDemoSeedRelPath = (): string =>
  resolveWorkspaceRunReadyDemoSeedRelPath(readWorkspaceRunReadyDemoId())
