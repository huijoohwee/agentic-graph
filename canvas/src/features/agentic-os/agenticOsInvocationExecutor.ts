import { AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA } from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'
import type {
  AgenticOsCommandInvocationResolution,
  AgenticOsMcpInvocationResolution,
} from './agenticOsMcpInvocationResolver'
import {
  WebMcpToolInputValidationError,
  type WebMcpToolRegistry,
} from '@/features/agent-ready/webMcpToolRegistry'
import type {
  WebMcpToolInput,
} from '@/features/agent-ready/webMcpRuntimeTypes'

type AgenticOsInvocationResolution =
  | AgenticOsMcpInvocationResolution
  | AgenticOsCommandInvocationResolution

export type AgenticOsInvocationExpectedProof = Readonly<{
  sourceRevision: string
  catalogDigest: string
  routingSchema: typeof AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA
  routingDigest: string
}>

export type AgenticOsInvocationExecutionOutcome = Readonly<{
  status:
    | 'completed'
    | 'queued'
    | 'partial'
    | 'requested-user-input'
    | 'offline-unavailable'
    | 'blocked'
  toolName: string | null
  missingFields: readonly string[]
  result: unknown
  error: string
}>

const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^[0-9a-f]{64}$/
const TOOL_PATTERN = /^agenticgraph\.[A-Za-z0-9_.-]+$/

const blocked = (error: string, toolName: string | null = null): AgenticOsInvocationExecutionOutcome =>
  Object.freeze({
    status: 'blocked',
    toolName,
    missingFields: Object.freeze([]),
    result: null,
    error,
  })

const normalizeToolNames = (values: readonly unknown[]): readonly string[] =>
  Object.freeze([...new Set(values.map(value => String(value || '').trim()).filter(Boolean))])

const resolveCommandToolName = (
  resolution: AgenticOsInvocationResolution,
): string | AgenticOsInvocationExecutionOutcome => {
  const invocation = resolution.invocation
  const commandEntries = resolution.entries.filter(entry => (
    entry.kind === 'command' && entry.token === invocation.action
  ))
  if (commandEntries.length !== 1) {
    return blocked('The invocation does not contain exactly one action-matched command entry.')
  }
  const command = commandEntries[0]!
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

const validateProof = (
  resolution: AgenticOsInvocationResolution,
  expected: AgenticOsInvocationExpectedProof,
): string | null => {
  const invocation = resolution.invocation
  if (
    !SHA_PATTERN.test(expected.sourceRevision)
    || !DIGEST_PATTERN.test(expected.catalogDigest)
    || expected.routingSchema !== AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA
    || !DIGEST_PATTERN.test(expected.routingDigest)
  ) {
    return 'The expected invocation proof is incomplete or malformed.'
  }
  if (
    resolution.sourceRevision !== invocation.sourceRevision
    || resolution.catalogDigest !== invocation.catalogDigest
    || invocation.sourceRevision !== expected.sourceRevision
    || invocation.catalogDigest !== expected.catalogDigest
    || invocation.routingSchema !== expected.routingSchema
    || invocation.routingDigest !== expected.routingDigest
  ) {
    return 'The invocation proof is stale relative to the current catalog snapshot.'
  }
  if (!invocation.action.startsWith('/')) {
    return 'Only a source-backed slash command may execute.'
  }
  if (
    invocation.semantics.some(token => !token.startsWith('#'))
    || invocation.bindings.some(token => !token.startsWith('@'))
  ) {
    return 'Invocation modifiers do not match the canonical / # @ grammar.'
  }
  const semantics = resolution.entries.filter(entry => entry.kind === 'semantic').map(entry => entry.token)
  const bindings = resolution.entries.filter(entry => entry.kind === 'binding').map(entry => entry.token)
  if (!tokensEqual(semantics, invocation.semantics) || !tokensEqual(bindings, invocation.bindings)) {
    return 'Invocation modifiers changed after source-backed resolution.'
  }
  return null
}

const resultStatus = (result: unknown): string => (
  result && typeof result === 'object' ? String((result as { status?: unknown }).status || '') : ''
)

export async function executeAgenticOsInvocation(args: Readonly<{
  resolution: AgenticOsInvocationResolution
  expectedProof: AgenticOsInvocationExpectedProof
  registry: WebMcpToolRegistry
  input?: WebMcpToolInput
  online?: boolean
}>): Promise<AgenticOsInvocationExecutionOutcome> {
  const proofError = validateProof(args.resolution, args.expectedProof)
  if (proofError) return blocked(proofError)
  const resolvedTool = resolveCommandToolName(args.resolution)
  if (typeof resolvedTool !== 'string') return resolvedTool
  if (!TOOL_PATTERN.test(resolvedTool)) {
    return blocked('The resolved tool name is not canonical.', resolvedTool)
  }
  const tool = args.registry.get(resolvedTool)
  if (!tool) return blocked('The exact resolved tool is unavailable in this runtime.', resolvedTool)
  try {
    const result = await args.registry.execute(resolvedTool, args.input)
    const status = resultStatus(result)
    if (status === 'queued' || status === 'requested-user-input' || status === 'partial') {
      return Object.freeze({
        status,
        toolName: resolvedTool,
        missingFields: Object.freeze([]),
        result,
        error: '',
      })
    }
    if (result && typeof result === 'object' && (result as { ok?: unknown }).ok === false) {
      return Object.freeze({
        status: 'blocked',
        toolName: resolvedTool,
        missingFields: Object.freeze([]),
        result,
        error: String((result as { error?: unknown }).error || 'The tool rejected the invocation.'),
      })
    }
    return Object.freeze({
      status: 'completed',
      toolName: resolvedTool,
      missingFields: Object.freeze([]),
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
        result: null,
        error: message,
      })
    }
    return Object.freeze({
      status: args.online === false ? 'offline-unavailable' : 'blocked',
      toolName: resolvedTool,
      missingFields: Object.freeze([]),
      result: null,
      error: message,
    })
  }
}
