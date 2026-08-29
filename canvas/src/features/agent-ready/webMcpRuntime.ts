import { resetBrowserLocalSurfaceSnapshotsForTests } from './browserLocalSurfaceSnapshots'
import { createWebMcpLifecycleController } from './webMcpLifecycle.mjs'
import { getAgenticGraphWebMcpToolRegistry } from './webMcpToolRegistry'
import type {
  ModelContextLike,
  ModelContextRegistrationState,
  WebMcpNavigator,
  WebMcpRuntimeState,
} from './webMcpRuntimeTypes'

const WEB_MCP_LATE_BINDING_RETRY_DELAY_MS = 500
const WEB_MCP_LATE_BINDING_MAX_ATTEMPTS = 20
const webMcpToolRegistry = getAgenticGraphWebMcpToolRegistry()
const webMcpToolNames = webMcpToolRegistry.tools.map(tool => tool.name)
const webMcpRuntimeState: WebMcpRuntimeState = {
  fallbackContext: null,
  activeRegisteredContext: null,
  registrations: new WeakMap<ModelContextLike, ModelContextRegistrationState>(),
  lateBindingRetryId: null,
  lateBindingAttemptCount: 0,
}

const markWebMcpRuntime = (state = webMcpToolNames.join(',')): void => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.kgWebmcpTools = webMcpToolNames.join(',')
  document.documentElement.dataset.kgWebmcpContext = state
}

const markWebMcpHostBinding = (state: string): void => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.kgWebmcpHostContext = state
}

const webMcpLifecycle = createWebMcpLifecycleController({
  root: globalThis as typeof globalThis & { navigator?: WebMcpNavigator; window?: { navigator?: WebMcpNavigator } },
  state: webMcpRuntimeState as unknown as Record<string, unknown>,
  tools: webMcpToolRegistry.tools,
  toolNames: webMcpToolNames,
  lateBindingRetryDelayMs: WEB_MCP_LATE_BINDING_RETRY_DELAY_MS,
  lateBindingMaxAttempts: WEB_MCP_LATE_BINDING_MAX_ATTEMPTS,
  markRuntimeState: markWebMcpRuntime,
  markHostBindingState: markWebMcpHostBinding,
})

export { getAgenticGraphWebMcpToolRegistry } from './webMcpToolRegistry'

export function installAgenticGraphWebMcpRuntime(): void {
  if (typeof globalThis === 'undefined') return
  webMcpLifecycle.install()
}

export function resetAgenticGraphWebMcpRuntimeForTests(): void {
  webMcpLifecycle.dispose()
  webMcpRuntimeState.activeRegisteredContext = null
  webMcpRuntimeState.registrations = new WeakMap<ModelContextLike, ModelContextRegistrationState>()
  webMcpRuntimeState.lateBindingAttemptCount = 0
  resetBrowserLocalSurfaceSnapshotsForTests()
  if (typeof document !== 'undefined') {
    delete document.documentElement.dataset.kgWebmcpContext
    delete document.documentElement.dataset.kgWebmcpHostContext
    delete document.documentElement.dataset.kgWebmcpTools
  }
}
