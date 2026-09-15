const SHA_PATTERN = /^[0-9a-f]{40}$/
const SOURCE_PATH = 'runtime/agents/docs/PROGRESSIVE-AGENTS.md'
const GROWTH_STAGES = ['single-agent', 'tool-enabled-agent', 'specialist-workflow'] as const

const normalizeString = (value: unknown): string => String(value || '').trim()

export type AgenticOsProgressiveAgentsReadinessSummary = {
  schema: 'progressive-agents-readiness-summary/v1'
  status: 'runtime-ready-dev' | 'unavailable'
  sourceRevision: string
  sourcePath: typeof SOURCE_PATH
  sourceUrl: string
  contractSchema: string
  runtimeScope: string
  runtimeOwner: string
  runtimeProof: string
  contractReady: boolean
  configured: boolean | null
  progressionPolicy: 'single-agent-then-tools-then-specialists' | 'unavailable'
  growthStages: string[]
  externalSdkDependency: boolean | null
  providerExecutionStatus: 'unverified' | 'unavailable'
  defaultWorkerConfigured: boolean | null
  deployPolicy: string
}

export const emptyProgressiveAgentsReadiness = (
  sourceRevision = '',
): AgenticOsProgressiveAgentsReadinessSummary => ({
  schema: 'progressive-agents-readiness-summary/v1',
  status: 'unavailable',
  sourceRevision,
  sourcePath: SOURCE_PATH,
  sourceUrl: SHA_PATTERN.test(sourceRevision)
    ? `https://github.com/huijoohwee/agentic-os/blob/${sourceRevision}/${SOURCE_PATH}`
    : '',
  contractSchema: '',
  runtimeScope: '',
  runtimeOwner: '',
  runtimeProof: '',
  contractReady: false,
  configured: null,
  progressionPolicy: 'unavailable',
  growthStages: [],
  externalSdkDependency: null,
  providerExecutionStatus: 'unavailable',
  defaultWorkerConfigured: null,
  deployPolicy: '',
})

export const normalizeProgressiveAgentsReadiness = (
  value: unknown,
  sourceRevision: string,
): AgenticOsProgressiveAgentsReadinessSummary => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyProgressiveAgentsReadiness(sourceRevision)
  }
  const readiness = value as Record<string, unknown>
  const normalizedSourceRevision = normalizeString(readiness.sourceRevision)
  const sourceUrl = normalizeString(readiness.sourceUrl)
  const growthStages = Array.isArray(readiness.growthStages)
    ? readiness.growthStages.map(normalizeString)
    : []
  const verified = readiness.schema === 'progressive-agents-readiness-summary/v1'
    && readiness.status === 'runtime-ready-dev'
    && normalizedSourceRevision === sourceRevision
    && readiness.sourcePath === SOURCE_PATH
    && sourceUrl === `https://github.com/huijoohwee/agentic-os/blob/${sourceRevision}/${SOURCE_PATH}`
    && readiness.contractSchema === 'progressive-agents-runtime-contract/v1'
    && Boolean(normalizeString(readiness.runtimeScope))
    && readiness.runtimeOwner === '../../adapters/progressive-agents.js'
    && readiness.runtimeProof === '../../../__tests__/progressive-agents.test.mjs'
    && readiness.contractReady === true
    && readiness.configured === false
    && readiness.progressionPolicy === 'single-agent-then-tools-then-specialists'
    && JSON.stringify(growthStages) === JSON.stringify(GROWTH_STAGES)
    && readiness.externalSdkDependency === false
    && readiness.providerExecutionStatus === 'unverified'
    && readiness.defaultWorkerConfigured === false
    && readiness.deployPolicy === 'Dev-only until explicit operator approval'
  if (!verified) return emptyProgressiveAgentsReadiness(sourceRevision)

  return {
    schema: 'progressive-agents-readiness-summary/v1',
    status: 'runtime-ready-dev',
    sourceRevision: normalizedSourceRevision,
    sourcePath: SOURCE_PATH,
    sourceUrl,
    contractSchema: 'progressive-agents-runtime-contract/v1',
    runtimeScope: normalizeString(readiness.runtimeScope),
    runtimeOwner: '../../adapters/progressive-agents.js',
    runtimeProof: '../../../__tests__/progressive-agents.test.mjs',
    contractReady: true,
    configured: false,
    progressionPolicy: 'single-agent-then-tools-then-specialists',
    growthStages: [...GROWTH_STAGES],
    externalSdkDependency: false,
    providerExecutionStatus: 'unverified',
    defaultWorkerConfigured: false,
    deployPolicy: 'Dev-only until explicit operator approval',
  }
}
