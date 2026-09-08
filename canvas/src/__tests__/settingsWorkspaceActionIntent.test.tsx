import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useSettingsWorkspaceActions } from '@/features/panels/views/useSettingsWorkspaceActions'
import { SettingsSpecialValueNode } from '@/features/panels/views/SettingsSpecialValueNode'
import { registerMarkdownWorkspaceActionBridge, type WorkspaceBridgeImportResult } from '@/features/markdown-explorer/workspaceActionBridge'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'

type Kind = 'chatHistory' | 'agentic-graph'
type Actions = ReturnType<typeof useSettingsWorkspaceActions>
type HookArgs = Parameters<typeof useSettingsWorkspaceActions>[0]
const key = (kind: Kind, suffix: string) => `${kind === 'chatHistory' ? 'chatHistory' : 'chatAgenticGraph'}${suffix}`
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
type Fixture = {
  actions: () => Actions
  values: () => Record<string, string>
  patches: Record<string, string>[]
  opened: string[]
  click: (kind: Kind, label: string) => Promise<void>
  setCloudDraft: (kind: Kind, url: string) => Promise<void>
  unmount: () => Promise<void>
  dom: ReturnType<typeof initJsdomHarness>['dom']
}

const withActions = async (options: {
  create?: HookArgs['createWorkspaceFilePathImpl']
  importFiles?: () => Promise<void | WorkspaceBridgeImportResult> | void | WorkspaceBridgeImportResult
  importUrl?: () => Promise<void> | void
}, run: (fixture: Fixture) => Promise<void>): Promise<void> => {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const patches: Record<string, string>[] = [], opened: string[] = []
  let values: Record<string, string> = {}, actions: Actions | null = null, mounted = true
  let updateDraft!: React.Dispatch<React.SetStateAction<Record<string, string>>>
  const previousActivePath = useMarkdownExplorerStore.getState().activePath
  const unregister = registerMarkdownWorkspaceActionBridge(`settings-intent-${crypto.randomUUID()}`, {
    importLocalFiles: options.importFiles || (() => ({ createdPaths: [] })),
    importLocalFolder: options.importFiles || (() => ({ createdPaths: [] })),
    importUrl: options.importUrl || (() => void 0),
  })
  function Harness() {
    const [draft, setDraft] = React.useState<Record<string, string>>({
      chatAgenticGraphStorageMode: 'local', chatHistoryStorageMode: 'local',
      chatAgenticGraphCloudUrl: 'https://choice.example/graph.md', chatHistoryCloudUrl: 'https://choice.example/history.md',
      chatAgenticGraphWorkspacePath: '/docs/graph-before.md', chatHistoryWorkspacePath: '/docs/history-before.md',
    })
    updateDraft = setDraft
    actions = useSettingsWorkspaceActions({ patchChatValues: patch => {
      patches.push(patch); setDraft(previous => ({ ...previous, ...patch }))
    }, chatLocalStorageRootPath: '', chatHistoryCloudUrl: draft.chatHistoryCloudUrl,
      chatAgenticGraphCloudUrl: draft.chatAgenticGraphCloudUrl,
      createWorkspaceFilePathImpl: options.create || (async () => '/docs/created.md'),
      openWorkspaceFileImpl: path => { opened.push(path) } })
    values = draft
    const common = { area: 'chat', inputNode: null, sectionActionClassName: '', sectionStatusClassName: '',
      actions: actions as any, refs: actions as any, status: actions as any, ui: { uiPanelKeyValueTextSizeClass: '' }, values: draft }
    return <>{(['chatHistory', 'agentic-graph'] as Kind[]).map(kind => <section key={kind} data-kind={kind}>
      <SettingsSpecialValueNode {...common} sKey={key(kind, 'WorkspacePath')} resolvedValueKey={key(kind, 'WorkspacePath')} />
      <SettingsSpecialValueNode {...common} sKey={key(kind, 'CloudUrl')} resolvedValueKey={key(kind, 'CloudUrl')} />
    </section>)}</>
  }
  const unmount = async () => { if (mounted) { mounted = false; await act(async () => { root.unmount() }) } }
  const errors: unknown[] = []
  try {
    await act(async () => { root.render(<Harness />) })
    await run({ dom, patches, opened, actions: () => actions!, values: () => values, unmount,
      setCloudDraft: async (kind, url) => { await act(async () => { updateDraft(previous => ({ ...previous, [key(kind, 'CloudUrl')]: url })) }) },
      click: async (kind, label) => {
        const row = container.querySelector(`[data-kind="${kind}"]`) as HTMLElement
        const button = Array.from(row.querySelectorAll('button')).find(element => element.textContent === label)
        assert.ok(button, `expected the real ${kind} Settings ${label} control`)
        assert.equal(button.disabled, false, `${label} must remain available to express a newer choice`)
        await act(async () => { button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
      } })
  } catch (error) { errors.push(error) }
  finally {
    try { await unmount() } catch (error) { errors.push(error) }
    try { unregister() } catch (error) { errors.push(error) }
    try { useMarkdownExplorerStore.getState().setActivePath(previousActivePath) } catch (error) { errors.push(error) }
    try { container.remove() } catch (error) { errors.push(error) }
    try { restore() } catch (error) { errors.push(error) }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw new AggregateError(errors, 'Settings intent body and cleanup failed')
}

export async function testSettingsDelayedCreateCannotReplaceNewerCloudChoice() {
  for (const kind of ['chatHistory', 'agentic-graph'] as Kind[]) {
    const old = deferred<string>()
    await withActions({ create: async () => old.promise }, async fixture => {
      try {
        await fixture.click(kind, 'New File')
        await fixture.click(kind, 'Import URL')
        const newer = { ...fixture.values() }
        await act(async () => { old.resolve('/docs/older-created.md'); await old.promise })
        assert.deepEqual(fixture.values(), newer, 'late creation must not clear the chosen URL or replace the draft path')
        assert.equal(fixture.values()[key(kind, 'StorageMode')], 'cloud')
        assert.deepEqual(fixture.opened, [], 'obsolete completion must not steal the active editor')
      } finally { await act(async () => { old.resolve('/docs/older-created.md'); await old.promise }) }
    })
  }
}

export async function testSettingsDelayedCreateCannotReplaceNewerLocalImport() {
  const old = deferred<string>()
  await withActions({ create: async () => old.promise, importFiles: () => {
    useMarkdownExplorerStore.getState().setActivePath('/docs/newer-import.md')
    return { createdPaths: [] }
  } }, async fixture => {
    try {
      await fixture.click('agentic-graph', 'New File')
      await act(async () => { fixture.actions().importLocalFilesForAgenticGraph([new File(['# source'], 'newer-import.md')]) })
      assert.equal(fixture.values().chatAgenticGraphWorkspacePath, '/docs/newer-import.md')
      const newer = { ...fixture.values() }
      await act(async () => { old.resolve('/docs/older-created.md'); await old.promise })
      assert.deepEqual(fixture.values(), newer)
      assert.deepEqual(fixture.opened, [])
    } finally { await act(async () => { old.resolve('/docs/older-created.md'); await old.promise }) }
  })
}

export async function testSettingsWorkspaceIntentIsIndependentPerDestination() {
  const graph = deferred<string>()
  await withActions({ create: async () => graph.promise }, async fixture => {
    try {
      await fixture.click('agentic-graph', 'New File')
      await fixture.click('chatHistory', 'Import URL')
      await act(async () => { graph.resolve('/docs/graph-current.md'); await graph.promise })
      assert.equal(fixture.values().chatAgenticGraphStorageMode, 'local')
      assert.equal(fixture.values().chatAgenticGraphWorkspacePath, '/docs/graph-current.md')
      assert.equal(fixture.values().chatHistoryStorageMode, 'cloud')
      assert.equal(fixture.values().chatHistoryCloudUrl, 'https://choice.example/history.md')
      assert.deepEqual(fixture.opened, ['/docs/graph-current.md'])
    } finally { await act(async () => { graph.resolve('/docs/graph-current.md'); await graph.promise }) }
  })
}

export async function testSettingsOldCreateCannotClearNewerPendingStateOrOutliveUnmount() {
  const old = deferred<string>(), newer = deferred<string>()
  let calls = 0
  await withActions({ create: async () => (++calls === 1 ? old.promise : newer.promise) }, async fixture => {
    try {
      await fixture.click('agentic-graph', 'New File')
      await fixture.click('agentic-graph', 'Import URL')
      await fixture.click('agentic-graph', 'New File')
      await act(async () => { old.reject(new Error('obsolete failure')); await old.promise.catch(() => void 0) })
      assert.equal(fixture.actions().isUpdatingAgenticGraphPath, true)
      assert.equal(fixture.actions().agenticGraphPathStatus, null)
      const beforeUnmount = fixture.patches.length
      await fixture.unmount()
      await act(async () => { newer.resolve('/docs/after-unmount.md'); await newer.promise })
      assert.equal(fixture.patches.length, beforeUnmount, 'unmounted Settings must not publish a late draft')
      assert.deepEqual(fixture.opened, [])
    } finally {
      await act(async () => { old.resolve('/docs/old.md'); newer.resolve('/docs/after-unmount.md'); await Promise.allSettled([old.promise, newer.promise]) })
    }
  })
}

export async function testSettingsImportCompletionAndRetryCannotReplaceNewerCloudChoice() {
  const imported = deferred<void | WorkspaceBridgeImportResult>()
  await withActions({ importFiles: () => imported.promise }, async fixture => {
    try {
      await act(async () => { fixture.actions().importLocalFilesForChatHistory([new File(['# old'], 'older.md')]) })
      await fixture.setCloudDraft('chatHistory', 'https://choice.example/newer-import.md')
      await fixture.click('chatHistory', 'Import URL')
      assert.equal(fixture.values().chatHistoryStorageMode, 'cloud')
      const chosen = { ...fixture.values() }
      useMarkdownExplorerStore.getState().setActivePath('/docs/older.md')
      await act(async () => { imported.resolve({ createdPaths: [] }); await imported.promise })
      assert.deepEqual(fixture.values(), chosen)
    } finally { await act(async () => { imported.resolve({ createdPaths: [] }); await imported.promise }) }
  })
  await withActions({}, async fixture => {
    useMarkdownExplorerStore.getState().setActivePath(null)
    const previousSet = fixture.dom.window.setTimeout, previousClear = fixture.dom.window.clearTimeout
    let retry: (() => void) | null = null, cancelled = false
    fixture.dom.window.setTimeout = ((callback: TimerHandler) => { retry = callback as () => void; return 71 }) as typeof previousSet
    fixture.dom.window.clearTimeout = ((id: number) => { if (id === 71) cancelled = true }) as typeof previousClear
    try {
      await act(async () => { fixture.actions().importLocalFilesForChatHistory([new File(['# old'], 'older.md')]) })
      assert.ok(retry, 'the actual import action must schedule its active-path retry')
      await fixture.setCloudDraft('chatHistory', 'https://choice.example/newer-import.md')
      await fixture.click('chatHistory', 'Import URL')
      assert.equal(fixture.values().chatHistoryStorageMode, 'cloud')
      assert.equal(cancelled, true)
      const chosen = { ...fixture.values() }
      useMarkdownExplorerStore.getState().setActivePath('/docs/older-retry.md')
      await act(async () => { retry!() })
      assert.deepEqual(fixture.values(), chosen, 'an already queued stale retry must not apply an unrelated active path')
    } finally { fixture.dom.window.setTimeout = previousSet; fixture.dom.window.clearTimeout = previousClear }
  })
}


const requireActionCompletion = (value: unknown): Promise<void> => {
  assert.ok(value && typeof (value as Promise<void>).then === 'function', 'the action must return its actual completion promise')
  return value as Promise<void>
}

export async function testSettingsCloudImportReturnsActualCompletion() {
  for (const kind of ['chatHistory', 'agentic-graph'] as Kind[]) {
    const imported = deferred<void>()
    let operation: Promise<void> | undefined, completed = false
    await withActions({ importUrl: () => imported.promise }, async fixture => {
      try {
        await act(async () => {
          operation = requireActionCompletion(kind === 'chatHistory'
            ? fixture.actions().importCloudUrlForChatHistory() : fixture.actions().importCloudUrlForAgenticGraph())
          void operation.then(() => { completed = true })
        })
        assert.equal(completed, false, 'returning from the click must not report an unfinished import as complete')
        assert.equal(fixture.values()[key(kind, 'StorageMode')], 'cloud', 'draft intent is visible while import is pending')
        await act(async () => { imported.resolve(); await operation })
        assert.equal(completed, true)
      } finally { await act(async () => { imported.resolve(); await (operation || imported.promise) }) }
    })
  }
}

export async function testSettingsLocalImportReturnsActualCompletion() {
  for (const kind of ['chatHistory', 'agentic-graph'] as Kind[]) {
    for (const selection of ['files', 'folder'] as const) {
      const imported = deferred<void | WorkspaceBridgeImportResult>()
      let operation: Promise<void> | undefined, completed = false
      await withActions({ importFiles: () => imported.promise }, async fixture => {
        try {
          useMarkdownExplorerStore.getState().setActivePath('/docs/awaited-import.md')
          await act(async () => {
            const actions = fixture.actions()
            const action = kind === 'chatHistory'
              ? selection === 'files' ? actions.importLocalFilesForChatHistory : actions.importLocalFolderForChatHistory
              : selection === 'files' ? actions.importLocalFilesForAgenticGraph : actions.importLocalFolderForAgenticGraph
            operation = requireActionCompletion(action([new File(['# imported'], 'awaited-import.md')]))
            void operation.then(() => { completed = true })
          })
          assert.equal(completed, false, 'the action remains pending until its bridge import settles')
          assert.equal(fixture.values()[key(kind, 'StorageMode')], 'local')
          await act(async () => { imported.resolve({ createdPaths: [] }); await operation })
          assert.equal(completed, true)
          assert.equal(fixture.values()[key(kind, 'WorkspacePath')], '/docs/awaited-import.md')
        } finally { await act(async () => { imported.resolve({ createdPaths: [] }); await (operation || imported.promise) }) }
      })
    }
  }
}
