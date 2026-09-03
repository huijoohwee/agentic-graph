import { createWebMcpLifecycleController } from '@/features/agent-ready/webMcpLifecycle.mjs'

export function testWebMcpFallbackReadinessSurvivesHostRetryExhaustion() {
  const scheduledCallbacks: Array<() => void> = []
  const runtimeStates: string[] = []
  const hostStates: string[] = []
  const registeredTools: string[] = []
  const nativeRegistrationSignals: AbortSignal[] = []
  const activeNativeTools = new Set<string>()
  const navigatorObject: { modelContext?: unknown } = {}
  const documentObject: { documentElement: { dataset: Record<string, string> }; modelContext?: unknown } = {
    documentElement: { dataset: {} },
  }
  const lifecycleState = {
    fallbackContext: null,
    activeRegisteredContext: null,
    registrations: new WeakMap(),
    lateBindingRetryId: null,
    lateBindingAttemptCount: 0,
  }
  const root = {
    document: documentObject,
    navigator: navigatorObject,
    window: {
      navigator: navigatorObject,
      setTimeout: (callback: () => void) => {
        scheduledCallbacks.push(callback)
        return scheduledCallbacks.length
      },
      clearTimeout: () => undefined,
    },
  }
  const controller = createWebMcpLifecycleController({
    root,
    state: lifecycleState,
    tools: [{ name: 'agentic-graph.test_runtime', execute: async () => ({ ok: true }) }],
    toolNames: ['agentic-graph.test_runtime'],
    lateBindingRetryDelayMs: 1,
    lateBindingMaxAttempts: 1,
    markRuntimeState: (state: string) => runtimeStates.push(state),
    markHostBindingState: (state: string) => hostStates.push(state),
  })

  controller.install()
  if (runtimeStates.at(-1) !== 'fallback-readable' || hostStates.at(-1) !== 'awaiting-model-context') {
    throw new Error(`expected readable fallback with pending host binding, got ${runtimeStates.at(-1)}/${hostStates.at(-1)}`)
  }
  const fallbackContext = navigatorObject.modelContext
  controller.install()
  if (navigatorObject.modelContext !== fallbackContext
    || lifecycleState.fallbackContext !== fallbackContext
    || runtimeStates.at(-1) !== 'fallback-readable'
    || hostStates.at(-1) !== 'awaiting-model-context'
    || runtimeStates.includes('installed')
    || hostStates.includes('installed')) {
    throw new Error('expected repeated install to preserve fallback readiness without claiming a native host binding')
  }
  scheduledCallbacks.shift()?.()
  if (runtimeStates.at(-1) !== 'fallback-readable' || hostStates.at(-1) !== 'retry-exhausted') {
    throw new Error(`expected retry exhaustion to preserve functional fallback readiness, got ${runtimeStates.at(-1)}/${hostStates.at(-1)}`)
  }

  const nativeModelContext = {
    registerTool(tool: { name: string }, options?: { signal?: AbortSignal }) {
      registeredTools.push(tool.name)
      activeNativeTools.add(tool.name)
      if (options?.signal) {
        nativeRegistrationSignals.push(options.signal)
        options.signal.addEventListener('abort', () => activeNativeTools.delete(tool.name), { once: true })
      }
    },
  }
  navigatorObject.modelContext = nativeModelContext
  if (runtimeStates.at(-1) !== 'installed'
    || hostStates.at(-1) !== 'installed'
    || registeredTools.join('|') !== 'agentic-graph.test_runtime'
    || !activeNativeTools.has('agentic-graph.test_runtime')) {
    throw new Error('expected a native host context assigned after retry exhaustion to install normally')
  }

  navigatorObject.modelContext = null
  if (navigatorObject.modelContext !== fallbackContext
    || runtimeStates.at(-1) !== 'fallback-readable'
    || hostStates.at(-1) !== 'awaiting-model-context'
    || nativeRegistrationSignals.some(signal => !signal.aborted)
    || activeNativeTools.size !== 0) {
    throw new Error('expected native host teardown to release registrations and restore truthful fallback readiness')
  }
  navigatorObject.modelContext = nativeModelContext
  if (runtimeStates.at(-1) !== 'installed'
    || hostStates.at(-1) !== 'installed'
    || registeredTools.join('|') !== 'agentic-graph.test_runtime|agentic-graph.test_runtime'
    || !activeNativeTools.has('agentic-graph.test_runtime')) {
    throw new Error('expected the same native host object to rebind live tools after fallback readiness')
  }
}
