import { useSyncExternalStore } from 'react'
import {
  resolveAgenticOsCommandInvocation,
  resolveAgenticOsMcpInvocation,
  type AgenticOsCommandInvocationResolution,
  type AgenticOsMcpInvocationResolution,
} from './agenticOsMcpInvocationResolver'
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
    resolve: () => resolveAgenticOsMcpInvocation(mcpTool),
  })
}

export function targetSkillsCommandsCommandInvocation(
  commandRaw: string,
): Promise<AgenticOsCommandInvocationResolution> {
  const command = String(commandRaw || '').trim()
  return targetSkillsCommandsInvocation({
    target: command,
    targetKind: 'command-token',
    resolve: () => resolveAgenticOsCommandInvocation(command),
  })
}

export function clearSkillsCommandsMcpTarget(): void {
  requestEpoch += 1
  pendingByTarget.clear()
  emit(EMPTY_SNAPSHOT)
}

registerSkillsCommandsMcpTargetLifecycleClear(clearSkillsCommandsMcpTarget)

export const resetSkillsCommandsMcpTargetForTests = clearSkillsCommandsMcpTarget
