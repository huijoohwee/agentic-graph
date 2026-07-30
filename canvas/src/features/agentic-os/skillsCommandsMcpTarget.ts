import { useSyncExternalStore } from 'react'
import {
  resolveAgenticOsMcpInvocation,
  type AgenticOsMcpInvocationResolution,
} from './agenticOsMcpInvocationResolver'

export type SkillsCommandsMcpTargetSnapshot = Readonly<{
  mcpTool: string
  status: 'idle' | 'loading' | 'ready' | 'blocked'
  error: string
  resolution: AgenticOsMcpInvocationResolution | null
}>

const EMPTY_SNAPSHOT: SkillsCommandsMcpTargetSnapshot = Object.freeze({
  mcpTool: '',
  status: 'idle',
  error: '',
  resolution: null,
})

let snapshot = EMPTY_SNAPSHOT
let requestEpoch = 0
const listeners = new Set<() => void>()
const pendingByTool = new Map<string, Promise<AgenticOsMcpInvocationResolution>>()

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

export function targetSkillsCommandsMcpInvocation(
  mcpToolRaw: string,
): Promise<AgenticOsMcpInvocationResolution> {
  const mcpTool = String(mcpToolRaw || '').trim()
  if (snapshot.mcpTool === mcpTool && snapshot.status === 'ready' && snapshot.resolution) {
    return Promise.resolve(snapshot.resolution)
  }
  const epoch = ++requestEpoch
  emit({ mcpTool, status: 'loading', error: '', resolution: null })
  const pending = pendingByTool.get(mcpTool) || resolveAgenticOsMcpInvocation(mcpTool)
  pendingByTool.set(mcpTool, pending)
  return pending.then(resolution => {
    if (epoch === requestEpoch) emit({ mcpTool, status: 'ready', error: '', resolution })
    return resolution
  }).catch(error => {
    const message = error instanceof Error ? error.message : 'Skills & Commands MCP resolution failed.'
    if (epoch === requestEpoch) emit({ mcpTool, status: 'blocked', error: message, resolution: null })
    pendingByTool.delete(mcpTool)
    throw error
  }).finally(() => {
    if (pendingByTool.get(mcpTool) === pending) pendingByTool.delete(mcpTool)
  })
}

export function clearSkillsCommandsMcpTarget(): void {
  requestEpoch += 1
  pendingByTool.clear()
  emit(EMPTY_SNAPSHOT)
}

export const resetSkillsCommandsMcpTargetForTests = clearSkillsCommandsMcpTarget
