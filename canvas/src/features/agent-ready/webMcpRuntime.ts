import { useGraphStore } from '@/hooks/useGraphStore'
import { resetBrowserLocalSurfaceSnapshotsForTests } from './browserLocalSurfaceSnapshots'
import { readAgentRunWorkspace, subscribeAgentRunWorkspace } from './agentRunInspectionStore'
import { createWebMcpLifecycleController } from './webMcpLifecycle.mjs'
import { createWebMcpToolExposure, measureWebMcpExposure, resolveWebMcpToolScope } from './webMcpToolExposure.mjs'
import { getAgenticGraphWebMcpToolRegistry } from './webMcpToolRegistry'
import type { ModelContextLike, ModelContextRegistrationState, WebMcpNavigator, WebMcpRuntimeState } from './webMcpRuntimeTypes'

let activeScope = resolveWebMcpToolScope(useGraphStore.getState(), Boolean(readAgentRunWorkspace()))
let contextScope = activeScope
let subscriptions: Array<() => void> = []
const exposure = createWebMcpToolExposure(getAgenticGraphWebMcpToolRegistry(), (scope: string) => {
  setScope(scope)
  return { scope: activeScope, ...measureWebMcpExposure(activeTools), toolNames: activeTools.map(tool => tool.name) }
})
let activeTools = exposure.get(activeScope)
const webMcpRuntimeState: WebMcpRuntimeState = {
  fallbackContext: null, activeRegisteredContext: null,
  registrations: new WeakMap<ModelContextLike, ModelContextRegistrationState>(),
  lateBindingRetryId: null, lateBindingAttemptCount: 0,
}
const markWebMcpRuntime = (state: string): void => {
  if (typeof document === 'undefined') return
  Object.assign(document.documentElement.dataset, {
    kgWebmcpTools: activeTools.map(tool => tool.name).join(','), kgWebmcpContext: state,
    kgWebmcpScope: activeScope, kgWebmcpBytes: String(measureWebMcpExposure(activeTools).bytes),
  })
}
const webMcpLifecycle = createWebMcpLifecycleController({
  root: globalThis as typeof globalThis & { navigator?: WebMcpNavigator; window?: { navigator?: WebMcpNavigator } },
  state: webMcpRuntimeState as unknown as Record<string, unknown>, tools: activeTools,
  lateBindingRetryDelayMs: 500, lateBindingMaxAttempts: 20,
  markRuntimeState: markWebMcpRuntime,
  markHostBindingState: (state: string) => {
    if (typeof document !== 'undefined') document.documentElement.dataset.kgWebmcpHostContext = state
  },
})
function setScope(scope: string): void {
  if (scope === activeScope) return
  const tools = exposure.get(scope) // Check count/schema budget before touching active registrations.
  activeScope = scope; activeTools = tools
  webMcpLifecycle.updateTools(tools)
}
function updateContextScope(): void {
  const next = resolveWebMcpToolScope(useGraphStore.getState(), Boolean(readAgentRunWorkspace()))
  if (contextScope === next) return // Explicit discovery selection survives unrelated store updates.
  contextScope = next; setScope(next)
}
export { getAgenticGraphWebMcpToolRegistry } from './webMcpToolRegistry'
export function installAgenticGraphWebMcpRuntime(): void {
  if (subscriptions.length) { webMcpLifecycle.install(); return }
  contextScope = resolveWebMcpToolScope(useGraphStore.getState(), Boolean(readAgentRunWorkspace()))
  if (contextScope !== activeScope) setScope(contextScope)
  else webMcpLifecycle.install()
  subscriptions = [useGraphStore.subscribe(updateContextScope), subscribeAgentRunWorkspace(updateContextScope)]
}
export function resetAgenticGraphWebMcpRuntimeForTests(): void {
  subscriptions.splice(0).forEach(unsubscribe => unsubscribe())
  webMcpLifecycle.dispose()
  webMcpRuntimeState.activeRegisteredContext = null
  webMcpRuntimeState.registrations = new WeakMap<ModelContextLike, ModelContextRegistrationState>()
  webMcpRuntimeState.lateBindingAttemptCount = 0
  resetBrowserLocalSurfaceSnapshotsForTests()
  if (typeof document !== 'undefined') {
    for (const key of ['kgWebmcpContext', 'kgWebmcpHostContext', 'kgWebmcpTools', 'kgWebmcpScope', 'kgWebmcpBytes']) {
      delete document.documentElement.dataset[key]
    }
  }
}
