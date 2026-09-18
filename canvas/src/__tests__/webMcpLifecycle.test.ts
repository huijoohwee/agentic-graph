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

export function testWebMcpScopeReconciliationOwnsOnlyItsRegistrations() {
  for (const transport of ['register', 'provide', 'array', 'fallback']) {
    const core = { name: 'core', execute: async () => undefined }
    const old = { name: 'old', execute: async () => undefined }
    const next = { name: 'next', execute: async () => undefined }
    const foreign = { name: 'foreign', execute: async () => undefined }
    let registrations = 0
    const signals: AbortSignal[] = []
    const context = { tools: [foreign] } as { tools: typeof core[]; registerTool?: Function; provideContext?: Function }
    if (transport === 'register') context.registerTool = (tool: typeof core, { signal }: { signal: AbortSignal }) => {
      registrations++; signals.push(signal); context.tools.push(tool)
      signal.addEventListener('abort', () => context.tools.splice(context.tools.indexOf(tool), 1), { once: true })
    }
    if (transport === 'provide') context.provideContext = ({ tools }: { tools: typeof core[] }) => {
      registrations++; context.tools.splice(0, context.tools.length, ...tools)
    }
    const root = { navigator: {} as { modelContext?: typeof context } }
    if (transport !== 'fallback') root.navigator.modelContext = context
    const controller = createWebMcpLifecycleController({ root, state: {
      registrations: new WeakMap(), activeRegisteredContext: null, fallbackContext: null,
      lateBindingRetryId: null, lateBindingAttemptCount: 0,
    }, tools: [core, old] })
    controller.install()
    const active = root.navigator.modelContext!
    const initial = registrations
    controller.install(); controller.updateTools([core, old])
    if (initial !== registrations) throw Error(`${transport}: unchanged install repeated registration`)
    controller.updateTools([core, next])
    if (active.tools.includes(old) || !active.tools.includes(core) || !active.tools.includes(next)
      || (transport !== 'fallback' && !active.tools.includes(foreign))) throw Error(`${transport}: scope reconciliation lost ownership`)
    if (transport === 'register' && (!signals[1].aborted || signals[0].aborted || registrations !== 3)) {
      throw Error('inactive scope must abort once, preserving core registration')
    }
    try { controller.updateTools([core, core]); throw Error('duplicate accepted') }
    catch (error) { if ((error as Error).message === 'duplicate accepted') throw error }
    if (!active.tools.includes(next)) throw Error('malformed update changed the active catalog')
    controller.dispose()
    if (active.tools.some(tool => tool !== foreign) || (transport !== 'fallback' && !active.tools.includes(foreign))) {
      throw Error(`${transport}: disposal retained owned tools or removed foreign tools`)
    }
  }
  const foreign = { name: 'collision', execute: async () => undefined }
  let attempts = 0
  const context = { tools: [foreign], registerTool() { attempts++; throw Object.assign(Error('owned elsewhere'), { name: 'InvalidStateError' }) } }
  const controller = createWebMcpLifecycleController({ root: { navigator: { modelContext: context } }, state: {
    registrations: new WeakMap(), activeRegisteredContext: null, fallbackContext: null,
    lateBindingRetryId: null, lateBindingAttemptCount: 0,
  }, tools: [{ ...foreign }] })
  if (controller.installToolsIntoModelContext(context) || controller.installToolsIntoModelContext(context)) {
    throw Error('a foreign name collision must not be accepted as owned registration')
  }
  controller.dispose()
  if (attempts !== 1 || context.tools[0] !== foreign) throw Error('unchanged failure must not retry or release foreign ownership')
}
