import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { File } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { waitForSourceFilesBootstrap } from '@/features/source-files/waitForSourceFilesBootstrap'
import { beginSourceFilesDocumentIntent, completeSourceFilesBootstrap, failSourceFilesDocumentIntent,
  readSourceFilesBootstrapSnapshot } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { useWorkspaceImportActions } from '@/features/markdown-workspace/useWorkspaceFileActions/importActions'
import { useWorkspaceStatusHelpers } from '@/features/markdown-workspace/useWorkspaceFileActions/core'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'

function readiness() {
  let value: { basePhase: 'resolving' | 'ready' | 'error'; error: string | null } = { basePhase: 'resolving', error: null }
  const listeners = new Set<() => void>()
  return {
    read: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    publish: (basePhase: typeof value.basePhase, error: string | null = null) => {
      value = { basePhase, error }; for (const listener of listeners) listener()
    },
    count: () => listeners.size,
  }
}

test('bootstrap wait observes completion after subscribing and removes its listener', async () => {
  const source = readiness()
  const pending = waitForSourceFilesBootstrap({}, { ...source, subscribe: listener => {
    const stop = source.subscribe(listener); source.publish('ready'); return stop
  } })
  await pending
  assert.equal(source.count(), 0)
})

test('bootstrap wait reports terminal base error and cleans up', async () => {
  const source = readiness(), pending = waitForSourceFilesBootstrap({}, source)
  assert.equal(source.count(), 1)
  source.publish('error', 'Persisted inventory could not load')
  await assert.rejects(pending, /Persisted inventory could not load/)
  assert.equal(source.count(), 0)
})

test('an absent bootstrap cannot implicitly become ready and has a bounded deadline', async () => {
  const source = readiness()
  await assert.rejects(waitForSourceFilesBootstrap({ timeoutMs: 5 }, source), /timed out/)
  assert.equal(source.count(), 0)
})

test('abort before and during bootstrap wait preserves the reason and cleans up', async () => {
  for (const before of [true, false]) {
    const source = readiness(), controller = new AbortController(), reason = new Error('Superseded import')
    if (before) controller.abort(reason)
    const pending = waitForSourceFilesBootstrap({ signal: controller.signal }, source)
    if (!before) controller.abort(reason)
    await assert.rejects(pending, error => error === reason)
    assert.equal(source.count(), 0)
    source.publish('ready')
  }
})

test('bootstrap observation failures preserve identity without leaking listeners', async () => {
  const source = readiness(), error = new Error('Read unavailable')
  await assert.rejects(waitForSourceFilesBootstrap({}, { ...source, read: () => { throw error } }), value => value === error)
  assert.equal(source.count(), 0)
})

test('cold launch fallbacks share one pending owner and report base failure without reading files or network', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import {File} from 'node:buffer';
    import {failSourceFilesBootstrap} from './canvas/src/features/source-files/sourceFilesBootstrapReadiness.ts';
    import {importLocalFilesFallback as files, importLocalFolderFallback as folder, importUrlFallback as url} from './canvas/src/features/toolbar/launchDropdownFallbacks.ts';
    const toasts=[]; let reads=0, requests=0;
    globalThis.fetch=async()=>{requests++;throw Error('unexpected network')};
    const file=new File(['# Selected bytes'],'selected.md'); file.text=async()=>{reads++;return '# Selected bytes'};
    const pushUiToast=value=>toasts.push(value);
    const first=files({files:[file],pushUiToast}), second=folder({files:[file],pushUiToast});
    const third=url({urlRaw:'https://example.invalid/selected.md',pushUiToast});
    assert.deepEqual(await first,{handled:true}); assert.deepEqual(await second,{handled:true});
    const fourth=url({urlRaw:'https://example.invalid/newer.md',pushUiToast});
    assert.deepEqual(await third,{handled:true});
    const cancelled=toasts.filter(value=>value.message==='Import replaced by a newer request');
    assert.deepEqual(cancelled.map(value=>value.id),['launch:import:localFiles','launch:import:folder','launch:import:url']);
    assert.ok(cancelled.every(value=>value.dismissible&&value.ttlMs>0&&value.busy===false));
    assert.equal(toasts.at(-1).id,'launch:import:url'); assert.equal(toasts.at(-1).busy,true);
    assert.equal(toasts.filter(value=>value.kind==='error').length,0);
    failSourceFilesBootstrap(Error('Inventory unavailable'));
    assert.deepEqual(await fourth,{handled:true,error:'Inventory unavailable'});
    assert.equal(reads,0); assert.equal(requests,0);
    assert.equal(toasts.filter(value=>value.kind==='error').length,1);
  `], { cwd: new URL('../../../', import.meta.url), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, TSX_TSCONFIG_PATH: 'canvas/tsconfig.json' } })
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error))
})

test('mounted import hooks serialize cold imports, retain selected bytes and cancel stale owners', async () => {
  const { restore } = initJsdomHarness(), graph = useGraphStore.getState()
  type Args = Parameters<typeof useWorkspaceImportActions>[0]
  type Actions = ReturnType<typeof useWorkspaceImportActions>
  const fixtures: Array<{ unmount: () => Promise<void> }> = []
  const jobs: Promise<unknown>[] = []
  const make = async (strict = false) => {
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host), fs = createMemoryWorkspaceFs(), statuses: string[] = []
    let calls = 0, mounted = true, actions!: Actions
    const core: Args['core'] = {
      importJobRef: { current: 0 }, focusAfterImport: async () => { assert.fail('fixture stops before focus') },
      status: { setStatusProgress: (message: string) => { statuses.push(message) }, setStatusInfo: (message: string) => { statuses.push(message) },
        setStatusError: (message: string) => { statuses.push(message) } } as Args['core']['status'],
    }
    const ctx: Args['ctx'] = {
      getFs: async () => { calls++; return fs }, refresh: async () => { throw new Error('Fixture stops after persisted import') },
      openedPath: null, activeDocumentKey: '', setActiveText: () => {}, setEntries: () => {}, lastLoadedRef: { current: null },
      setActiveMarkdownDocument: async () => true,
    }
    function Harness() {
      const status = useWorkspaceStatusHelpers()
      core.status = { ...status, setStatusProgress: (...args) => { statuses.push(args[0]); status.setStatusProgress(...args) },
        setStatusInfo: (...args) => { statuses.push(args[0]); status.setStatusInfo(...args) },
        setStatusError: (...args) => { statuses.push(args[0]); status.setStatusError(...args) } }
      actions = useWorkspaceImportActions({ core, ctx }); return null
    }
    const render = () => act(async () => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, null, React.createElement(Harness))))
    await render()
    const fixture = { fs, statuses, ctx, core, render, calls: () => calls, actions: () => actions,
      unmount: async () => { if (mounted) { mounted = false; await act(async () => root.unmount()); host.remove() } } }
    fixtures.push(fixture); return fixture
  }
  const file = (name: string, text = '# Retained selected bytes 保留\n') => new File([text], name, { type: 'text/markdown' }) as unknown as globalThis.File
  const start = (job: Promise<unknown>) => { jobs.push(job); return job }
  try {
    assert.equal(readSourceFilesBootstrapSnapshot().basePhase, 'resolving')
    const newest = await make(), retained = await make(), unmounted = await make(), strict = await make(true), raced = await make(), replaced = await make()
    const old = start(newest.actions().handleImportLocalFiles([file('older.md')]))
    const folderFile = file('newer.md'); Object.defineProperty(folderFile, 'webkitRelativePath', { value: 'chosen/newer.md' })
    const latest = start(newest.actions().handleImportLocalFolder([folderFile]))
    await old
    assert.equal(newest.calls(), 0)
    const selection = [file('retained.md')], selected = selection[0]
    const retainedJob = start(retained.actions().handleImportLocalFiles(selection)); selection.length = 0
    const unmountedJob = start(unmounted.actions().handleImportUrl('https://example.invalid/source.md'))
    const strictJob = start(strict.actions().handleImportLocalFiles([file('strict.md')]))
    const racedJob = start(raced.actions().handleImportLocalFiles([file('raced.md')]))
    const replacedJob = start(replaced.actions().handleImportLocalFiles([file('replaced.md')]))
    const currentToast = () => useGraphStore.getState().uiToasts.find(value => value.id === 'markdown-workspace-status')
    const newestToast = currentToast()
    assert.equal(newestToast?.busy, true)
    await unmounted.unmount(); await strict.unmount()
    assert.equal(currentToast(), newestToast, 'older hook cleanup cannot overwrite newer identical progress')
    replaced.ctx.getFs = async () => { assert.fail('replacement workspace must not receive the old selection') }
    await replaced.render()
    const cancelled = currentToast()
    assert.equal(cancelled?.message, 'Import cancelled'); assert.equal(cancelled?.busy, false)
    assert.equal(cancelled?.dismissible, true); assert.equal(typeof cancelled?.expiresAtMs, 'number')
    await Promise.all([unmountedJob, strictJob, replacedJob])
    for (const fixture of [newest, retained, unmounted, strict, raced, replaced]) {
      assert.equal(fixture.calls(), 0)
      assert.equal((await fixture.fs.listEntries()).filter(entry => entry.kind === 'file').length, 0)
      assert.ok(fixture.statuses.includes('Preparing workspace before import'))
      assert.equal(fixture.statuses.some(message => message.startsWith('Import failed')), false)
    }
    beginSourceFilesDocumentIntent('unrelated-failed-document')
    failSourceFilesDocumentIntent('unrelated-failed-document', 'Old document failed')
    await act(async () => { completeSourceFilesBootstrap(); await raced.unmount() })
    await Promise.all([latest, retainedJob, racedJob])
    assert.equal(readSourceFilesBootstrapSnapshot().phase, 'error')
    assert.equal(raced.calls(), 0, 'ready publication followed by unmount cannot cross the getFs fence')
    assert.equal(newest.calls(), 1); assert.equal(retained.calls(), 1)
    const retainedEntry = (await retained.fs.listEntries()).find(entry => entry.name === selected.name)
    assert.ok(retainedEntry); assert.equal(await retained.fs.readFileText(retainedEntry.path), await selected.text())
    const newestEntries = await newest.fs.listEntries()
    assert.ok(newestEntries.some(entry => entry.name === 'newer.md'))
    assert.equal(newestEntries.some(entry => entry.name === 'older.md'), false)
    beginSourceFilesDocumentIntent('unrelated-resolving-document')
    let readyCalls = 0
    replaced.ctx.getFs = async () => { readyCalls++; throw new Error('Reached ready workspace') }
    await replaced.render()
    await start(replaced.actions().handleImportUrl('https://example.invalid/source.md'))
    assert.equal(readSourceFilesBootstrapSnapshot().phase, 'resolving')
    assert.equal(readyCalls, 1)
    assert.equal(replaced.statuses.at(-1), 'Import failed: Reached ready workspace')
    const failedJob = replaced.core.importJobRef.current
    await replaced.unmount()
    assert.equal(replaced.core.importJobRef.current, failedJob, 'getFs rejection releases pending ownership')
    const acquiring = await make()
    let enteredFs!: () => void, releaseFs!: () => void
    const fsEntered = new Promise<void>(resolve => { enteredFs = resolve }), fsGate = new Promise<void>(resolve => { releaseFs = resolve })
    acquiring.ctx.getFs = async () => { enteredFs(); await fsGate; return acquiring.fs }
    await acquiring.render()
    const acquiringJob = start(acquiring.actions().handleImportLocalFiles([file('cancel-before-write.md')]))
    await fsEntered; await acquiring.unmount(); releaseFs(); await acquiringJob
    assert.equal((await acquiring.fs.listEntries()).filter(entry => entry.kind === 'file').length, 0)
    for (const superseded of [false, true]) {
      const running = await make()
      let enteredRefresh!: () => void, releaseRefresh!: () => void, focused = 0
      const refreshEntered = new Promise<void>(resolve => { enteredRefresh = resolve })
      const refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve })
      running.ctx.refresh = async () => { enteredRefresh(); await refreshGate; return { entries: await running.fs.listEntries(), sourcesByPath: {} } }
      running.core.focusAfterImport = async () => { focused++ }
      await running.render()
      const runningJob = start(running.actions().handleImportLocalFiles([file('running.md')]))
      await refreshEntered; await running.unmount()
      if (superseded) running.core.importJobRef.current++
      releaseRefresh(); await runningJob
      assert.equal(focused, superseded ? 0 : 1)
      assert.equal(running.statuses.at(-1)?.startsWith('Imported 1'), !superseded,
        'surface unmount preserves running import completion; a newer job still suppresses it')
    }
  } finally {
    for (const fixture of fixtures) await fixture.unmount()
    await Promise.allSettled(jobs)
    useGraphStore.setState(graph, true); restore()
  }
})
