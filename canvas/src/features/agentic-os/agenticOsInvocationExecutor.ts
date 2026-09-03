import { AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA } from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'
import {
  resolveAgenticOsCommandInvocation,
  resolveAgenticOsMcpInvocation,
  type AgenticOsCommandInvocationResolution,
  type AgenticOsMcpInvocationResolution,
} from './agenticOsMcpInvocationResolver'
import { getAgenticOsRemoteGrammarCatalogSnapshot } from './agenticOsRemoteGrammarClient'
import {
  WebMcpToolInputValidationError,
  type WebMcpToolRegistry,
} from '@/features/agent-ready/webMcpToolRegistry'
import type { WebMcpToolInput } from '@/features/agent-ready/webMcpRuntimeTypes'

type AgenticOsInvocationResolution =
  | AgenticOsMcpInvocationResolution
  | AgenticOsCommandInvocationResolution

export type AgenticOsInvocationConfirmation = Readonly<{
  challenge: string
  fingerprint: string
  expiresAt: string
  title: string
  description: string
}>

export type AgenticOsInvocationExecutionOutcome = Readonly<{
  status:
    | 'completed'
    | 'queued'
    | 'partial'
    | 'requested-user-input'
    | 'confirmation-required'
    | 'offline-unavailable'
    | 'blocked'
  toolName: string | null
  missingFields: readonly string[]
  confirmation: AgenticOsInvocationConfirmation | null
  result: unknown
  error: string
}>

const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^[0-9a-f]{64}$/
const TOOL_PATTERN = /^agentic-graph\.[A-Za-z0-9_.-]+$/

const blocked = (error: string, toolName: string | null = null): AgenticOsInvocationExecutionOutcome =>
  Object.freeze({
    status: 'blocked',
    toolName,
    missingFields: Object.freeze([]),
    confirmation: null,
    result: null,
    error,
  })

const unavailable = (
  error: string,
  online: boolean | undefined,
): AgenticOsInvocationExecutionOutcome => Object.freeze({
  status: online === false ? 'offline-unavailable' : 'blocked',
  toolName: null,
  missingFields: Object.freeze([]),
  confirmation: null,
  result: null,
  error,
})

const normalizeToolNames = (values: readonly unknown[]): readonly string[] =>
  Object.freeze([...new Set(values.map(value => String(value || '').trim()).filter(Boolean))])

const resolveCommandToolName = (
  resolution: AgenticOsInvocationResolution,
): string | AgenticOsInvocationExecutionOutcome => {
  const invocation = resolution.invocation
  const commandEntries = resolution.entries.filter(entry => entry.kind === 'command')
  if (commandEntries.length !== 1 || commandEntries[0]?.token !== invocation.action) {
    return blocked('The invocation does not contain exactly one action-matched command entry.')
  }
  const command = commandEntries[0]
  const declaredTools = normalizeToolNames([
    ...(command.mcpTools || []),
    command.mcpTool || '',
  ])
  if ('mcpTool' in resolution) {
    if (invocation.tool !== resolution.mcpTool || !declaredTools.includes(resolution.mcpTool)) {
      return blocked('The selected MCP tool is not bound to the exact source-backed command.')
    }
    return resolution.mcpTool
  }
  if (invocation.tool !== resolution.command || invocation.action !== resolution.command) {
    return blocked('The command target changed after source-backed resolution.')
  }
  if (declaredTools.length !== 1) {
    return blocked('A command must resolve to exactly one executable MCP tool before dispatch.')
  }
  return declaredTools[0]!
}

const tokensEqual = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((token, index) => token === right[index])

const validateAttestedResolution = (resolution: AgenticOsInvocationResolution): string | null => {
  const invocation = resolution.invocation
  if (
    !SHA_PATTERN.test(resolution.sourceRevision)
    || !DIGEST_PATTERN.test(resolution.catalogDigest)
    || resolution.sourceRevision !== invocation.sourceRevision
    || resolution.catalogDigest !== invocation.catalogDigest
    || invocation.routingSchema !== AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA
    || !DIGEST_PATTERN.test(invocation.routingDigest)
  ) {
    return 'The source-backed invocation proof is incomplete or malformed.'
  }
  if (!invocation.action.startsWith('/')) return 'Only a source-backed slash command may execute.'
  if (
    invocation.semantics.some(token => !token.startsWith('#'))
    || invocation.bindings.some(token => !token.startsWith('@'))
  ) {
    return 'Invocation modifiers do not match the canonical / # @ grammar.'
  }
  const semantics = resolution.entries.filter(entry => entry.kind === 'semantic').map(entry => entry.token)
  const bindings = resolution.entries.filter(entry => entry.kind === 'binding').map(entry => entry.token)
  const tokens = resolution.entries.map(entry => entry.token)
  if (
    !tokensEqual(semantics, invocation.semantics)
    || !tokensEqual(bindings, invocation.bindings)
    || !tokensEqual(tokens, [invocation.action, ...invocation.semantics, ...invocation.bindings])
  ) {
    return 'Invocation tokens changed after source-backed resolution.'
  }
  const pinnedSource = `/blob/${resolution.sourceRevision}/docs/DICTIONARY-`
  if (resolution.entries.some(entry => !String(entry.sourcePath || '').includes(pinnedSource))) {
    return 'Invocation entries are not pinned to the attested dictionary revision.'
  }
  return null
}

const resolutionProjection = (resolution: AgenticOsInvocationResolution): string => JSON.stringify({
  target: 'mcpTool' in resolution
    ? { kind: 'mcp-tool', value: resolution.mcpTool }
    : { kind: 'command-token', value: resolution.command },
  sourceRevision: resolution.sourceRevision,
  catalogDigest: resolution.catalogDigest,
  invocation: resolution.invocation,
  entries: resolution.entries.map(entry => ({
    kind: entry.kind,
    token: entry.token,
    sourcePath: entry.sourcePath,
    mcpTool: entry.mcpTool || '',
    mcpTools: entry.mcpTools || [],
  })),
})

const attestedResolutionProjections = new WeakMap<object, string>()

const retainAttestedResolution = <T extends AgenticOsInvocationResolution>(resolution: T): T => {
  const error = validateAttestedResolution(resolution)
  if (error) throw new Error(error)
  attestedResolutionProjections.set(resolution, resolutionProjection(resolution))
  return resolution
}

export const resolveAttestedAgenticOsCommandInvocation = async (
  command: string,
): Promise<AgenticOsCommandInvocationResolution> =>
  retainAttestedResolution(await resolveAgenticOsCommandInvocation(command))

export const resolveAttestedAgenticOsMcpInvocation = async (
  mcpTool: string,
): Promise<AgenticOsMcpInvocationResolution> =>
  retainAttestedResolution(await resolveAgenticOsMcpInvocation(mcpTool))

const currentCatalogMatches = (resolution: AgenticOsInvocationResolution): boolean => {
  const catalog = getAgenticOsRemoteGrammarCatalogSnapshot()
  return catalog.hydration.status === 'fresh'
    && catalog.routingVerified === true
    && catalog.sourceRevision === resolution.sourceRevision
    && catalog.catalogDigest === resolution.catalogDigest
    && catalog.routingSchema === resolution.invocation.routingSchema
    && catalog.routingDigest === resolution.invocation.routingDigest
}

const cloneJsonValue = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (!value || typeof value !== 'object') throw new Error('Invocation input must contain only JSON values.')
  if (seen.has(value)) throw new Error('Invocation input must not contain cycles.')
  seen.add(value)
  if (Array.isArray(value)) {
    const clone = Object.freeze(value.map(entry => cloneJsonValue(entry, seen)))
    seen.delete(value)
    return clone
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Invocation input must contain only JSON objects.')
  }
  const clone = Object.fromEntries(Object.keys(value as Record<string, unknown>)
    .sort()
    .map(key => [key, cloneJsonValue((value as Record<string, unknown>)[key], seen)]))
  seen.delete(value)
  return Object.freeze(clone)
}

const sha256 = async (value: string): Promise<string> => {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable for invocation confirmation.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

const buildExecutionFingerprint = (
  resolution: AgenticOsInvocationResolution,
  toolName: string,
  input: WebMcpToolInput,
): Promise<string> => sha256(JSON.stringify({
  schema: 'agentic-graph-invocation-confirmation/v1',
  resolution: JSON.parse(resolutionProjection(resolution)),
  toolName,
  input: typeof input === 'undefined' ? { provided: false } : { provided: true, value: input },
}))

const CONFIRMATION_TTL_MS = 120_000
const MAX_ACTIVE_CONFIRMATIONS = 128
const confirmationChallenges = new Map<string, Readonly<{
  fingerprint: string
  expiresAtMs: number
}>>()

const purgeExpiredConfirmations = (now: number): void => {
  confirmationChallenges.forEach((record, challenge) => {
    if (record.expiresAtMs <= now) confirmationChallenges.delete(challenge)
  })
}

const createConfirmationChallenge = (
  fingerprint: string,
): Readonly<{ challenge: string; expiresAt: string }> => {
  const now = Date.now()
  purgeExpiredConfirmations(now)
  if (confirmationChallenges.size >= MAX_ACTIVE_CONFIRMATIONS) {
    throw new Error('Too many destructive confirmations are awaiting a decision.')
  }
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Cryptographic randomness is unavailable for destructive confirmation.')
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const challenge = `confirm:${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
  const expiresAtMs = now + CONFIRMATION_TTL_MS
  confirmationChallenges.set(challenge, Object.freeze({ fingerprint, expiresAtMs }))
  return Object.freeze({ challenge, expiresAt: new Date(expiresAtMs).toISOString() })
}

const consumeConfirmationChallenge = (challenge: string, fingerprint: string): boolean => {
  const record = confirmationChallenges.get(challenge)
  if (!record) return false
  confirmationChallenges.delete(challenge)
  return record.expiresAtMs > Date.now() && record.fingerprint === fingerprint
}

const resultStatus = (result: unknown): string => (
  result && typeof result === 'object' ? String((result as { status?: unknown }).status || '') : ''
)

export async function executeAgenticOsInvocation(args: Readonly<{
  resolution: AgenticOsInvocationResolution
  registry: WebMcpToolRegistry
  input?: WebMcpToolInput
  online?: boolean
  confirmationChallenge?: string
  selectionIsCurrent?: () => boolean
}>): Promise<AgenticOsInvocationExecutionOutcome> {
  const resolution = args.resolution
  let currentProjection: string
  let input: WebMcpToolInput
  try {
    currentProjection = resolutionProjection(resolution)
    input = typeof args.input === 'undefined'
      ? undefined
      : cloneJsonValue(args.input) as Record<string, unknown>
  } catch (error) {
    return blocked(error instanceof Error ? error.message : 'Invocation input or selection is malformed.')
  }
  if (args.selectionIsCurrent?.() === false) return blocked('The displayed invocation selection changed before execution.')
  const attestedProjection = attestedResolutionProjections.get(resolution)
  if (!attestedProjection || attestedProjection !== currentProjection) {
    return blocked('The invocation is not an unchanged resolver-attested local capability.')
  }
  const attestationError = validateAttestedResolution(resolution)
  if (attestationError) return blocked(attestationError)
  if (!currentCatalogMatches(resolution)) {
    return unavailable('The cached source-backed catalog proof is no longer current.', args.online)
  }
  const resolvedTool = resolveCommandToolName(resolution)
  if (typeof resolvedTool !== 'string') return resolvedTool
  if (!TOOL_PATTERN.test(resolvedTool)) return blocked('The resolved tool name is not canonical.', resolvedTool)
  const tool = args.registry.get(resolvedTool)
  if (!tool) return blocked('The exact resolved tool is unavailable in this runtime.', resolvedTool)

  let fingerprint: string
  try {
    fingerprint = await buildExecutionFingerprint(resolution, resolvedTool, input)
  } catch (error) {
    return blocked(error instanceof Error ? error.message : 'Invocation confirmation fingerprint failed.', resolvedTool)
  }
  if (!currentCatalogMatches(resolution)) {
    return unavailable('The cached source-backed catalog proof changed during execution preparation.', args.online)
  }
  if (args.selectionIsCurrent?.() === false) return blocked('The displayed invocation selection changed before dispatch.', resolvedTool)
  if (tool.annotations?.destructiveHint === true) {
    if (args.confirmationChallenge) {
      if (!consumeConfirmationChallenge(args.confirmationChallenge, fingerprint)) {
        return blocked('The destructive confirmation challenge is invalid, expired, consumed, or bound to different input.', resolvedTool)
      }
    } else {
      try {
        const confirmation = createConfirmationChallenge(fingerprint)
        return Object.freeze({
          status: 'confirmation-required',
          toolName: resolvedTool,
          missingFields: Object.freeze([]),
          confirmation: Object.freeze({
            ...confirmation,
            fingerprint,
            title: String(tool.title || resolvedTool),
            description: String(tool.description || ''),
          }),
          result: null,
          error: `Confirm the destructive command ${tool.title || resolvedTool} before execution.`,
        })
      } catch (error) {
        return blocked(error instanceof Error ? error.message : 'Destructive confirmation challenge failed.', resolvedTool)
      }
    }
  }

  try {
    const result = await args.registry.execute(resolvedTool, input)
    const status = resultStatus(result)
    if (status === 'queued' || status === 'requested-user-input' || status === 'partial') {
      return Object.freeze({
        status,
        toolName: resolvedTool,
        missingFields: Object.freeze([]),
        confirmation: null,
        result,
        error: '',
      })
    }
    if (result && typeof result === 'object' && (result as { ok?: unknown }).ok === false) {
      return Object.freeze({
        status: 'blocked',
        toolName: resolvedTool,
        missingFields: Object.freeze([]),
        confirmation: null,
        result,
        error: String((result as { error?: unknown }).error || 'The tool rejected the invocation.'),
      })
    }
    return Object.freeze({
      status: 'completed',
      toolName: resolvedTool,
      missingFields: Object.freeze([]),
      confirmation: null,
      result,
      error: '',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invocation execution failed.'
    if (error instanceof WebMcpToolInputValidationError) {
      return Object.freeze({
        status: 'requested-user-input',
        toolName: resolvedTool,
        missingFields: error.missingFields,
        confirmation: null,
        result: null,
        error: message,
      })
    }
    return Object.freeze({
      status: args.online === false ? 'offline-unavailable' : 'blocked',
      toolName: resolvedTool,
      missingFields: Object.freeze([]),
      confirmation: null,
      result: null,
      error: message,
    })
  }
}
