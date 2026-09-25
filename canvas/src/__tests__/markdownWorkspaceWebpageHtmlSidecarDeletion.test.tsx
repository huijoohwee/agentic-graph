import React from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownWorkspace } from '@/lib/markdown-workspace-runtime'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testMarkdownWorkspaceWebpageHtmlSidecarDeletionDoesNotRecreate() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  const g = globalThis as unknown as { fetch?: unknown }
  const prevFetch = g.fetch

  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const fs = await getWorkspaceFs()
    await fs.ensureSeed()

    const mdPath = await fs.createFile({
      parentPath: '/',
      name: 'www.example.md',
      text: ['---', 'kgWebpageUrl: "https://example.com/"', 'kgWebpageView: "html"', '---', '', '# Example', ''].join('\n'),
    })
    const otherPath = await fs.createFile({ parentPath: '/', name: 'other.md', text: '# Other\n' })

    const sidecarPath = await fs.createFile({
      parentPath: '/',
      name: 'www.example.webpage.html',
      text: '<!doctype html><html><body><h1>Cached</h1></body></html>',
    })

    if (sidecarPath !== '/www.example.webpage.html') {
      throw new Error(`unexpected sidecar path: ${sidecarPath}`)
    }

    g.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        text: async () => '<!doctype html><html><body><h1>Remote</h1></body></html>',
      }
    }) as unknown as typeof fetch

    useMarkdownExplorerStore.getState().setActivePath(mdPath)

    root.render(React.createElement(MarkdownWorkspace))

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: () => void) => number }
    const tick = () =>
      new Promise<void>(resolve => {
        const raf = anyWindow.requestAnimationFrame
        if (raf) {
          raf(() => resolve())
          return
        }
        setTimeout(() => resolve(), 0)
      })

    for (let i = 0; i < 12; i += 1) await tick()

    await fs.deleteEntry('/www.example.webpage.html')
    for (let i = 0; i < 6; i += 1) await tick()

    useMarkdownExplorerStore.getState().setActivePath(otherPath)
    for (let i = 0; i < 3; i += 1) await tick()
    useMarkdownExplorerStore.getState().setActivePath(mdPath)
    for (let i = 0; i < 16; i += 1) await tick()

    const after = await fs.readFileText('/www.example.webpage.html')
    if (after != null) {
      throw new Error('expected deleted .webpage.html sidecar not to be recreated')
    }

    root.unmount()
  } finally {
    g.fetch = prevFetch
    restoreDom()
  }
}


export async function testActiveSourceDeletionSettlesWritesAndClearsSelection() {
  const { dom, restore } = initJsdomHarness()
  const { useWorkspaceMutationActions } = await import('@/features/markdown-workspace/useWorkspaceFileActions/mutationActions')
  const { enqueueWorkspaceSourceTextTransaction } = await import('@/features/workspace-fs/workspaceSourceTextTransaction')
  const fs = await getWorkspaceFs(), path = await fs.createFile({ parentPath: '/', name: 'delete-race-fixture.md', text: 'original' })
  const container = dom.window.document.createElement('div'); dom.window.document.body.appendChild(container)
  const root = createRoot(container), events: string[] = []
  let actions: ReturnType<typeof useWorkspaceMutationActions> | undefined
  let deleted!: () => void
  const deletion = new Promise<void>(resolve => { deleted = resolve })
  const lastLoadedRef = { current: { path, text: 'original' } as { path: string; text: string } | null }
  function Harness() {
    actions = useWorkspaceMutationActions({ core: { status: {
      setStatusInfo: value => { events.push(value); if (value === 'Deleted') deleted() }, setStatusWarning: () => {}, setStatusError: value => { throw Error(value) },
      setStatusProgress: () => {}, clearStatus: () => {}, buildWebpageImportStageLabel: () => '',
    } }, ctx: { getFs: async () => fs, refresh: async () => ({ entries: await fs.listEntries(), sourcesByPath: {} }),
      openedPath: path, selectionPath: path, selectionEntryKind: 'file', activeDocumentKey: path,
      setActiveText: value => events.push(`text:${value}`), setEntries: () => {}, lastLoadedRef,
      setActiveMarkdownDocument: async () => true, setActivePathSafe: value => events.push(`active:${value}`),
      setSelectionPathSafe: value => { events.push(`selection:${value}`) },
    } })
    return null
  }
  try {
    root.render(React.createElement(Harness))
    for (let i = 0; i < 20 && !actions; i++) await new Promise(resolve => setTimeout(resolve, 10))
    let finish!: () => void
    const gate = new Promise<void>(resolve => { finish = resolve })
    const pending = enqueueWorkspaceSourceTextTransaction({ path, text: 'pending', write: async () => {
      await gate; await fs.writeFileText(path, 'pending')
    } })
    actions!.onDeleteEntry(path)
    await new Promise(resolve => setTimeout(resolve, 10))
    if (await fs.readFileText(path) === null) throw Error('Deletion must wait for in-flight source writes')
    finish(); await pending; await deletion
    if (await fs.readFileText(path) !== null) throw Error('Pending source write resurrected the deleted entry')
    if (lastLoadedRef.current !== null || !events.includes('active:/') || !events.includes('selection:/') || !events.includes('Deleted')) {
      throw Error(`Deletion did not clear editor ownership: ${events.join(',')}`)
    }
  } finally { root.unmount(); restore() }
}
