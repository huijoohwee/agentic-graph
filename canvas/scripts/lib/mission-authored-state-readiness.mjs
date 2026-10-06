/** Preload async modules once; Playwright waitForFunction polls a synchronous boolean. */
export async function waitForAuthoredWorkspaceSource(page, timeout = 60000) {
  const deadline = Date.now() + timeout
  await page.evaluate(async () => {
    const [{ readSourceFilesBootstrapReady, readSourceFilesBootstrapSnapshot }, sync, { useGraphStore }, { useMarkdownExplorerStore }] = await Promise.all([
      import('/src/features/source-files/sourceFilesBootstrapReadiness.ts'),
      import('/src/lib/workspace/workspaceSeedSyncRuntime.ts'),
      import('/src/hooks/useGraphStore.ts'),
      import('/src/features/markdown-explorer/store.ts'),
    ])
    window.__AG_MISSION_AUTHORED_SOURCE_READY__ = () => {
      const state = useGraphStore.getState(), path = useMarkdownExplorerStore.getState().activePath
      return sync.readWorkspaceSeedSyncRuntimeSnapshot().activeTaskCount === 0
        && readSourceFilesBootstrapReady() && state.historyIndex >= 0
        && (!path || state.sourceFiles.some(file => file?.source?.path === `workspace:${path}`))
    }
    window.__AG_MISSION_AUTHORED_SOURCE_SNAPSHOT__ = () => {
      const state = useGraphStore.getState(), path = useMarkdownExplorerStore.getState().activePath
      const bootstrap = readSourceFilesBootstrapSnapshot(), activity = sync.readWorkspaceSeedSyncRuntimeSnapshot()
      const files = Array.isArray(state.sourceFiles) ? state.sourceFiles : []
      const matching = files.filter(file => file?.source?.path === `workspace:${path}`)
      const message = String(bootstrap.error || '')
      return {
        bootstrap: { phase: bootstrap.phase, basePhase: bootstrap.basePhase, documentIntentPhase: bootstrap.documentIntentPhase,
          error: message ? { length: message.length, category: message.includes('Active document source changed during materialization')
            ? 'materialization-stale' : /pars/i.test(message) ? 'source-parse' : 'runtime-error' } : null },
        sync: { activeTaskCount: activity.activeTaskCount, suspensionCount: activity.suspensionCount },
        history: { index: state.historyIndex, length: Array.isArray(state.history) ? state.history.length : null },
        graph: { present: !!state.graphData, nodes: state.graphData?.nodes?.length ?? null, edges: state.graphData?.edges?.length ?? null },
        activePath: typeof path === 'string' ? path.slice(0, 512) : null,
        sourceCount: files.length, matchingCount: matching.length,
        matching: matching.slice(0, 8).map(file => ({ id: String(file.id || '').slice(0, 80),
          status: ['idle', 'loading', 'parsed', 'error'].includes(file.status) ? file.status : 'unknown' })),
      }
    }
  })
  try {
    // Store readiness must settle even when the browser is not producing visual frames.
    await page.waitForFunction(() => window.__AG_MISSION_AUTHORED_SOURCE_READY__() === true,
      null, { polling: 100, timeout: Math.max(1, deadline - Date.now()) })
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      let timer
      try {
        const snapshot = await Promise.race([
          page.evaluate(() => window.__AG_MISSION_AUTHORED_SOURCE_SNAPSHOT__()).catch(() => ({ unavailable: 'page' })),
          new Promise(resolve => { timer = setTimeout(() => resolve({ unavailable: 'deadline' }), 1000) }),
        ])
        error.readinessSnapshot = snapshot
        console.error('Authored readiness timeout:', JSON.stringify(snapshot))
      } catch { /* Keep the original error. */ }
      finally { clearTimeout(timer) }
    }
    throw error
  }
}
