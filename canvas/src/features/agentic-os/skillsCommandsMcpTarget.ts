import { useSyncExternalStore } from 'react'
import { AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA } from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'
import type {
  AgenticOsCommandInvocationResolution,
  AgenticOsMcpInvocationResolution,
} from './agenticOsMcpInvocationResolver'
import { getAgenticOsRemoteGrammarCatalogSnapshot } from './agenticOsRemoteGrammarClient'
import {
  executeAgenticOsInvocation,
  resolveAttestedAgenticOsCommandInvocation,
  resolveAttestedAgenticOsMcpInvocation,
  type AgenticOsInvocationExecutionOutcome,
} from './agenticOsInvocationExecutor'
import type { WebMcpToolInput } from '@/features/agent-ready/webMcpRuntimeTypes'
import type { WebMcpToolRegistry } from '@/features/agent-ready/webMcpToolRegistry'
import { registerSkillsCommandsMcpTargetLifecycleClear } from './skillsCommandsMcpTargetLifecycle'

export type SkillsCommandsMcpTargetSnapshot = Readonly<{
  target: string
  targetKind: 'idle' | 'mcp-tool' | 'command-token'
  mcpTool: string
  status: 'idle' | 'loading' | 'ready' | 'blocked'
  error: string
  resolution: AgenticOsMcpInvocationResolution | AgenticOsCommandInvocationResolution | null
}>

const EMPTY_SNAPSHOT: SkillsCommandsMcpTargetSnapshot = Object.freeze({
  target: '',
  targetKind: 'idle',
  mcpTool: '',
  status: 'idle',
  error: '',
  resolution: null,
})

const blockedExecution = (error: string): AgenticOsInvocationExecutionOutcome => Object.freeze({
  status: 'blocked',
  toolName: null,
  missingFields: Object.freeze([]),
  confirmation: null,
  result: null,
  error,
})

let snapshot = EMPTY_SNAPSHOT
let requestEpoch = 0
const listeners = new Set<() => void>()
const pendingByTarget = new Map<string, Promise<AgenticOsMcpInvocationResolution | AgenticOsCommandInvocationResolution>>()

const emit = (next: SkillsCommandsMcpTargetSnapshot) => {
  snapshot = Object.freeze(next)
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function readSkillsCommandsMcpTarget(): SkillsCommandsMcpTargetSnapshot {
  return snapshot
}

export function useSkillsCommandsMcpTarget(): SkillsCommandsMcpTargetSnapshot {
  return useSyncExternalStore(subscribe, readSkillsCommandsMcpTarget, readSkillsCommandsMcpTarget)
}

const targetSkillsCommandsInvocation = <T extends AgenticOsMcpInvocationResolution | AgenticOsCommandInvocationResolution>(args: {
  target: string
  targetKind: 'mcp-tool' | 'command-token'
  resolve: () => Promise<T>
}): Promise<T> => {
  const target = String(args.target || '').trim()
  if (snapshot.target === target && snapshot.targetKind === args.targetKind && snapshot.status === 'ready' && snapshot.resolution) {
    return Promise.resolve(snapshot.resolution as T)
  }
  const epoch = ++requestEpoch
  const key = `${args.targetKind}:${target}`
  emit({
    target,
    targetKind: args.targetKind,
    mcpTool: args.targetKind === 'mcp-tool' ? target : '',
    status: 'loading',
    error: '',
    resolution: null,
  })
  const pending = pendingByTarget.get(key) || args.resolve()
  pendingByTarget.set(key, pending)
  return pending.then(resolution => {
    if (epoch === requestEpoch) {
      emit({
        target,
        targetKind: args.targetKind,
        mcpTool: args.targetKind === 'mcp-tool' ? target : '',
        status: 'ready',
        error: '',
        resolution,
      })
    }
    return resolution as T
  }).catch(error => {
    const message = error instanceof Error ? error.message : 'Skills & Commands invocation resolution failed.'
    if (epoch === requestEpoch) {
      emit({
        target,
        targetKind: args.targetKind,
        mcpTool: args.targetKind === 'mcp-tool' ? target : '',
        status: 'blocked',
        error: message,
        resolution: null,
      })
    }
    pendingByTarget.delete(key)
    throw error
  }).finally(() => {
    if (pendingByTarget.get(key) === pending) pendingByTarget.delete(key)
  })
}

export function targetSkillsCommandsMcpInvocation(
  mcpToolRaw: string,
): Promise<AgenticOsMcpInvocationResolution> {
  const mcpTool = String(mcpToolRaw || '').trim()
  return targetSkillsCommandsInvocation({
    target: mcpTool,
    targetKind: 'mcp-tool',
    resolve: () => resolveAttestedAgenticOsMcpInvocation(mcpTool),
  })
}

export function targetSkillsCommandsCommandInvocation(
  commandRaw: string,
): Promise<AgenticOsCommandInvocationResolution> {
  const command = String(commandRaw || '').trim()
  return targetSkillsCommandsInvocation({
    target: command,
    targetKind: 'command-token',
    resolve: () => resolveAttestedAgenticOsCommandInvocation(command),
  })
}

export async function executeSkillsCommandsMcpTarget(args: Readonly<{
  input?: WebMcpToolInput
  online?: boolean
  registry?: WebMcpToolRegistry
  expectedResolution?: AgenticOsMcpInvocationResolution | AgenticOsCommandInvocationResolution
  confirmationChallenge?: string
}> = {}): Promise<AgenticOsInvocationExecutionOutcome> {
  const current = readSkillsCommandsMcpTarget()
  if (current.status !== 'ready' || !current.resolution || current.resolution !== args.expectedResolution) {
    return blockedExecution('Select one source-backed slash command before execution.')
  }
  const catalog = getAgenticOsRemoteGrammarCatalogSnapshot()
  if (catalog.hydration.status !== 'fresh'
    || catalog.routingVerified !== true
    || catalog.routingSchema !== AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA) {
    return blockedExecution('The current Agentic OS catalog is not fresh and routing-verified.')
  }
  const registry = args.registry || await import('@/features/agent-ready/webMcpRuntime')
    .then(module => module.getAgenticGraphWebMcpToolRegistry())
  const selectionIsCurrent = (): boolean => {
    const latestTarget = readSkillsCommandsMcpTarget()
    const latestCatalog = getAgenticOsRemoteGrammarCatalogSnapshot()
    return latestTarget.status === 'ready'
      && latestTarget.resolution === args.expectedResolution
      && latestCatalog.hydration.status === 'fresh'
      && latestCatalog.routingVerified === true
      && latestCatalog.sourceRevision === catalog.sourceRevision
      && latestCatalog.catalogDigest === catalog.catalogDigest
      && latestCatalog.routingSchema === catalog.routingSchema
      && latestCatalog.routingDigest === catalog.routingDigest
  }
  if (!selectionIsCurrent()) {
    return blockedExecution('The selected command or source-backed catalog changed before execution.')
  }
  return executeAgenticOsInvocation({
    resolution: current.resolution,
    registry,
    input: args.input,
    online: args.online,
    confirmationChallenge: args.confirmationChallenge,
    selectionIsCurrent,
  })
}

export function clearSkillsCommandsMcpTarget(): void {
  requestEpoch += 1
  pendingByTarget.clear()
  emit(EMPTY_SNAPSHOT)
}

registerSkillsCommandsMcpTargetLifecycleClear(clearSkillsCommandsMcpTarget)

export const resetSkillsCommandsMcpTargetForTests = clearSkillsCommandsMcpTarget
