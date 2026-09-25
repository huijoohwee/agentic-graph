export const createWebMcpLifecycleController = (args = {}) => {
  const root = args.root
  const lifecycleState = args.state
  let tools = Array.isArray(args.tools) ? args.tools : []
  let toolNames = tools.map(tool => tool.name)
  const lateBindingRetryDelayMs = Number(args.lateBindingRetryDelayMs || 500)
  const lateBindingMaxAttempts = Number(args.lateBindingMaxAttempts || 20)
  const markRuntimeState = typeof args.markRuntimeState === 'function' ? args.markRuntimeState : () => {}
  const markHostBindingState = typeof args.markHostBindingState === 'function' ? args.markHostBindingState : () => {}
  const fallbackModelContextBindings = []

  if (!root || !lifecycleState || typeof lifecycleState !== 'object') {
    throw new Error('root and state are required')
  }

  const readGlobalNavigator = () => {
    const windowNavigator = root.window && root.window.navigator
    if (windowNavigator && root.navigator !== windowNavigator) {
      try {
        Object.defineProperty(root, 'navigator', {
          configurable: true,
          value: windowNavigator,
        })
      } catch {
        root.navigator = windowNavigator
      }
      return windowNavigator
    }
    if (root.navigator) return root.navigator
    const navigatorObject = {}
    try {
      Object.defineProperty(root, 'navigator', {
        configurable: true,
        value: navigatorObject,
      })
    } catch {
      root.navigator = navigatorObject
    }
    return navigatorObject
  }

  const getRegistrationState = (context) => {
    const existing = lifecycleState.registrations.get(context)
    if (existing) return existing
    const created = {
      registeredToolNames: new Set(),
      abortControllers: new Map(),
      ownedTools: new Map(),
      toolSet: null,
      installed: false,
      generation: 0,
      pendingCount: 0,
    }
    lifecycleState.registrations.set(context, created)
    return created
  }

  const createFallbackModelContext = () => {
    const context = { tools: [] }
    const upsertTool = (tool) => {
      if (!tool || !tool.name) return
      const existingIndex = context.tools.findIndex((entry) => entry && entry.name === tool.name)
      if (existingIndex >= 0) context.tools.splice(existingIndex, 1, tool)
      else context.tools.push(tool)
    }
    context.provideContext = (provided = {}) => {
      context.tools.splice(0, context.tools.length)
      const providedTools = Array.isArray(provided.tools) ? provided.tools : []
      for (const tool of providedTools) upsertTool(tool)
    }
    context.registerTool = (tool, options = {}) => {
      if (!tool || !tool.name) throw new Error('tool name is required')
      if (context.tools.some((entry) => entry && entry.name === tool.name)) {
        const error = new Error(`tool already registered: ${tool.name}`)
        error.name = 'InvalidStateError'
        throw error
      }
      if (options.signal?.aborted) return
      context.tools.push(tool)
      if (options.signal && typeof options.signal.addEventListener === 'function') {
        options.signal.addEventListener('abort', () => {
          const index = context.tools.findIndex((entry) => entry && entry.name === tool.name)
          if (index >= 0) context.tools.splice(index, 1)
        }, { once: true })
      }
    }
    return context
  }

  const releaseTools = (context, registrationState, keep = new Set()) => {
    registrationState.generation += 1
    registrationState.pendingCount = 0
    registrationState.installed = false
    for (const [name, tool] of registrationState.ownedTools) {
      if (keep.has(tool)) continue
      registrationState.abortControllers.get(name)?.abort()
      if (Array.isArray(context.tools)) {
        const index = context.tools.indexOf(tool)
        if (index >= 0) context.tools.splice(index, 1)
      }
      registrationState.abortControllers.delete(name)
      registrationState.registeredToolNames.delete(name)
      registrationState.ownedTools.delete(name)
    }
  }
  const releasePreviousRegisteredContext = (nextContext) => {
    const active = lifecycleState.activeRegisteredContext
    if (active && active !== nextContext) {
      const registrationState = lifecycleState.registrations.get(active)
      if (registrationState) {
        releaseTools(active, registrationState)
        if (typeof active.registerTool !== 'function' && typeof active.provideContext === 'function') {
          try { active.provideContext({ tools: Array.isArray(active.tools) ? active.tools : [] }) } catch { /* Host is gone. */ }
        }
      }
      lifecycleState.registrations.delete(active)
    }
    lifecycleState.activeRegisteredContext = nextContext
  }

  const clearLateBindingRetry = () => {
    if (lifecycleState.lateBindingRetryId === null || !root.window || typeof root.window.clearTimeout !== 'function') return
    root.window.clearTimeout(lifecycleState.lateBindingRetryId)
    lifecycleState.lateBindingRetryId = null
  }

  const installToolsIntoModelContext = (context) => {
    const registrationState = getRegistrationState(context)
    if (registrationState.toolSet === tools) return registrationState.installed
    releasePreviousRegisteredContext(context)
    releaseTools(context, registrationState, registrationState.pendingCount ? new Set() : new Set(tools))
    registrationState.toolSet = tools
    registrationState.installed = false
    const generation = registrationState.generation
    if (context === lifecycleState.fallbackContext
      || (typeof context.registerTool !== 'function' && typeof context.provideContext === 'function')) {
      try {
        const foreign = Array.isArray(context.tools)
          ? context.tools.filter(tool => registrationState.ownedTools.get(tool.name) !== tool && !tools.includes(tool)) : []
        if (foreign.some(tool => tools.some(owned => owned.name === tool.name))) return false
        context.provideContext({ tools: [...foreign, ...tools] })
        tools.forEach(tool => registrationState.ownedTools.set(tool.name, tool))
        registrationState.installed = true
      } catch { return false }
    } else if (typeof context.registerTool === 'function') {
      for (const tool of tools) {
        if (registrationState.ownedTools.get(tool.name) === tool) continue
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        if (!controller) return false // A changing catalog requires removable registrations.
        try {
          const registration = context.registerTool(tool, { signal: controller.signal })
          registrationState.registeredToolNames.add(tool.name)
          registrationState.abortControllers.set(tool.name, controller)
          registrationState.ownedTools.set(tool.name, tool)
          if (registration && typeof registration.then === 'function') {
            registrationState.pendingCount += 1
            Promise.resolve(registration).then(() => {
              if (registrationState.generation !== generation || controller.signal.aborted) return
              registrationState.pendingCount -= 1
              if (registrationState.pendingCount !== 0) return
              registrationState.installed = true
              clearLateBindingRetry()
              markRuntimeState('installed')
              markHostBindingState('installed')
            }, () => {
              if (registrationState.generation !== generation || controller.signal.aborted) return
              releaseTools(context, registrationState)
              registrationState.toolSet = null
              markRuntimeState('awaiting-model-context')
              markHostBindingState('registration-failed')
              scheduleLateBindingRetry(readGlobalNavigator())
            })
          }
        } catch { controller.abort(); return false } // Never claim a foreign duplicate.
      }
      registrationState.installed = registrationState.pendingCount === 0
    } else if (Array.isArray(context.tools)) {
      for (const tool of tools) {
        if (context.tools.includes(tool)) continue
        if (context.tools.some(entry => entry?.name === tool.name)) return false
        context.tools.push(tool)
        registrationState.ownedTools.set(tool.name, tool)
      }
      registrationState.installed = true
    }
    if (registrationState.installed) releasePreviousRegisteredContext(context)
    return registrationState.installed
  }

  const tryInstallLateBoundModelContext = (nav) => {
    const context = nav.modelContext
    if (!context || context === lifecycleState.fallbackContext) return false
    const installed = installToolsIntoModelContext(context)
    if (installed) {
      clearLateBindingRetry()
      markRuntimeState('installed')
      markHostBindingState('installed')
      return true
    }
    return false
  }

  const scheduleLateBindingRetry = (nav) => {
    if (!root.window || typeof root.window.setTimeout !== 'function') return
    if (lifecycleState.lateBindingRetryId !== null) return
    if (lifecycleState.lateBindingAttemptCount >= lateBindingMaxAttempts) {
      markHostBindingState('retry-exhausted')
      return
    }
    lifecycleState.lateBindingRetryId = root.window.setTimeout(() => {
      lifecycleState.lateBindingRetryId = null
      lifecycleState.lateBindingAttemptCount += 1
      if (!tryInstallLateBoundModelContext(nav)) scheduleLateBindingRetry(nav)
    }, lateBindingRetryDelayMs)
  }

  const publishFallbackReadiness = (nav, restartRetryCycle = false) => {
    if (restartRetryCycle) {
      clearLateBindingRetry()
      lifecycleState.lateBindingAttemptCount = 0
      if (lifecycleState.fallbackContext) {
        installToolsIntoModelContext(lifecycleState.fallbackContext)
      }
    }
    markRuntimeState(
      toolNames.every((toolName) => nav.modelContext && Array.isArray(nav.modelContext.tools) && nav.modelContext.tools.some((entry) => entry && entry.name === toolName))
        ? 'fallback-readable'
        : 'awaiting-model-context',
    )
    markHostBindingState('awaiting-model-context')
    scheduleLateBindingRetry(nav)
  }

  const defineFallbackModelContext = (nav, context) => {
    lifecycleState.fallbackContext = context
    const doc = root.document
    let currentContext = (doc && doc.modelContext && doc.modelContext !== context)
      ? doc.modelContext
      : nav.modelContext && nav.modelContext !== context ? nav.modelContext : context
    const descriptor = {
      configurable: true,
      enumerable: false,
      get: () => currentContext,
      set: (value) => {
        const nextContext = value || context
        if (currentContext === nextContext) return
        currentContext = nextContext
        if (currentContext !== context) {
          if (!tryInstallLateBoundModelContext(nav)) publishFallbackReadiness(nav)
          return
        }
        publishFallbackReadiness(nav, true)
      },
    }
    try {
      Object.defineProperty(nav, 'modelContext', descriptor)
      fallbackModelContextBindings.push({ target: nav, descriptor })
    } catch {
      nav.modelContext = context
    }
    if (doc && !doc.modelContext) {
      try {
        Object.defineProperty(doc, 'modelContext', descriptor)
        fallbackModelContextBindings.push({ target: doc, descriptor })
      } catch {
        void 0
      }
    }
  }

  const dispose = () => {
    clearLateBindingRetry()
    releasePreviousRegisteredContext(null)
    const fallbackContext = lifecycleState.fallbackContext
    for (const binding of fallbackModelContextBindings.splice(0)) {
      const installedDescriptor = Object.getOwnPropertyDescriptor(binding.target, 'modelContext')
      if (installedDescriptor?.get !== binding.descriptor.get
        || installedDescriptor?.set !== binding.descriptor.set) continue
      const currentContext = binding.target.modelContext
      if (!Reflect.deleteProperty(binding.target, 'modelContext')) continue
      if (!currentContext || currentContext === fallbackContext) continue
      try {
        Object.defineProperty(binding.target, 'modelContext', {
          configurable: true,
          enumerable: installedDescriptor.enumerable === true,
          writable: true,
          value: currentContext,
        })
      } catch {
        binding.target.modelContext = currentContext
      }
    }
    lifecycleState.fallbackContext = null
    lifecycleState.lateBindingAttemptCount = 0
  }

  const install = () => {
    const nav = readGlobalNavigator()
    markRuntimeState('installing')
    markHostBindingState('installing')
    const docContext = root.document && root.document.modelContext
    const isHostModelContext = (context) => Boolean(
      context && context !== lifecycleState.fallbackContext,
    )
    if (isHostModelContext(docContext) && !nav.modelContext) {
      try {
        Object.defineProperty(nav, 'modelContext', {
          configurable: true,
          enumerable: false,
          get: () => root.document && root.document.modelContext,
          set: (value) => {
            if (value && value !== docContext) void installToolsIntoModelContext(value)
          },
        })
      } catch {
        nav.modelContext = docContext
      }
    }
    if (isHostModelContext(docContext) && installToolsIntoModelContext(docContext)) {
      markRuntimeState('installed')
      markHostBindingState('installed')
      return
    }
    if (isHostModelContext(nav.modelContext) && installToolsIntoModelContext(nav.modelContext)) {
      markRuntimeState('installed')
      markHostBindingState('installed')
      return
    }
    if (!nav.modelContext) defineFallbackModelContext(nav, createFallbackModelContext())
    if (nav.modelContext === lifecycleState.fallbackContext) installToolsIntoModelContext(nav.modelContext)
    publishFallbackReadiness(nav)
  }

  const updateTools = (nextTools) => {
    if (!Array.isArray(nextTools) || nextTools.some(tool => !tool?.name || typeof tool.execute !== 'function')
      || new Set(nextTools.map(tool => tool.name)).size !== nextTools.length) throw new Error('Invalid WebMCP tool catalog')
    if (tools.length === nextTools.length && tools.every((tool, index) => tool === nextTools[index])) return
    tools = nextTools
    toolNames = tools.map(tool => tool.name)
    // Catalog changes reconcile current bindings; they never restart the late-host retry cycle.
    install()
  }

  return {
    install,
    updateTools,
    clearLateBindingRetry,
    installToolsIntoModelContext,
    tryInstallLateBoundModelContext,
    scheduleLateBindingRetry,
    publishFallbackReadiness,
    defineFallbackModelContext,
    dispose,
    readGlobalNavigator,
  }
}
