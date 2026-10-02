/** Preload async modules once; Playwright waitForFunction polls a synchronous boolean. */
export async function waitForAuthoredWorkspaceSource(page, timeout = 60000) {
  const deadline = Date.now() + timeout
  await page.evaluate(async () => {
    const [{ readSourceFilesBootstrapReady }, sync, { useGraphStore }, { useMarkdownExplorerStore }] = await Promise.all([
      import('/src/features/source-files/sourceFilesBootstrapReadiness.ts'),
      import('/src/lib/workspace/workspaceSeedSyncRuntime.ts'),
      import('/src/hooks/useGraphStore.ts'),
      import('/src/features/markdown-explorer/store.ts'),
    ])
    window.__AG_MISSION_AUTHORED_SOURCE_READY__ = () => {
      const state = useGraphStore.getState(), path = useMarkdownExplorerStore.getState().activePath
      return sync.readWorkspaceSeedSyncRuntimeSnapshot().activeTaskCount === 0
        && readSourceFilesBootstrapReady() && state.historyIndex >= 0 && !!path
        && state.sourceFiles.some(file => file?.source?.path === `workspace:${path}`)
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  await page.waitForFunction(() => window.__AG_MISSION_AUTHORED_SOURCE_READY__() === true,
    null, { timeout: Math.max(1, deadline - Date.now()) })
}
