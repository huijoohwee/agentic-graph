import { WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH } from '@/features/workspace-fs/workspaceSourceRoots'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { persistMarkdownSourceFolderPaths, readPersistedMarkdownSourceFolderPaths } from '@/features/markdown/ui/markdownSourceFilesPersistence'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownWorkspace } from '@/lib/markdown-workspace-runtime'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

const tick = async () => {
  await new Promise<void>(resolve => {
    setTimeout(() => resolve(), 0)
  })
}

const findButtonByAriaLabel = (root: ParentNode, label: string): HTMLButtonElement | null => {
  const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[]
  for (const btn of buttons) {
    if (String(btn.getAttribute('aria-label') || '') === label) return btn
  }
  return null
}

const findButtonByText = (root: ParentNode, text: string): HTMLButtonElement | null => {
  const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[]
  return buttons.find(btn => String(btn.textContent || '').trim() === text) || null
}

export async function testMarkdownWorkspaceExplorerCrudActionsCreateAndDeleteFile() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  container.id = 'root'
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const prompt = dom.window.prompt
  const confirm = dom.window.confirm
  const previousExpanded = readPersistedMarkdownSourceFolderPaths()
  let cleanupFixture: (() => Promise<void>) | undefined

  try {
    useGraphStore.getState().resetAll()
    useMarkdownExplorerStore.getState().setActivePath(null)
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH })
    persistMarkdownSourceFolderPaths([...readPersistedMarkdownSourceFolderPaths(), WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH])
    const fixturePath = await fs.createFile({ parentPath: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH, name: 'crud-context-source.md', text: '# CRUD source' })
    cleanupFixture = () => fs.deleteEntry(fixturePath)
    const beforeEntries = await fs.listEntries()
    const beforePaths = new Set(beforeEntries.map(e => e.path))
    const createName = 'note-context-menu.md'
    ;(dom.window as unknown as { prompt: (message?: string, defaultValue?: string) => string }).prompt = () => createName
    ;(dom.window as unknown as { confirm: (message?: string) => boolean }).confirm = () => true

    await mountReactRoot(root, React.createElement(MarkdownWorkspace), {
      window: dom.window as unknown as Window,
      frames: 1,
      tasks: 1,
    })

    let sourceFileBtn: HTMLButtonElement | null = null
    for (let i = 0; i < 60; i += 1) {
      await tick()
      sourceFileBtn = (Array.from(container.querySelectorAll('button')).find(button => {
        const label = String((button as HTMLButtonElement).getAttribute('aria-label') || '')
        return label === `File ${fixturePath.split('/').pop()}`
      }) as HTMLButtonElement | undefined) || null
      if (sourceFileBtn) break
    }
    if (!sourceFileBtn) throw new Error('Source file row button not found')

    await React.act(async () => {
      sourceFileBtn.dispatchEvent(new dom.window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 24,
        clientY: 24,
      }))
      await tick()
    })

    let newFileBtn: HTMLButtonElement | null = null
    for (let i = 0; i < 40; i += 1) {
      await tick()
      newFileBtn = findButtonByText(container, 'New file')
      if (newFileBtn) break
    }
    if (!newFileBtn) throw new Error('New file context menu item not found')

    await React.act(async () => {
      newFileBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await tick()
    })

    let createdPath: string | null = null
    for (let i = 0; i < 80; i += 1) {
      await tick()
      const entries = await fs.listEntries()
      const candidates = entries
        .filter(e => e.kind === 'file')
        .filter(e => !beforePaths.has(e.path))
        .filter(e => String(e.name || '') === createName)
      if (candidates.length === 0) continue
      candidates.sort((a, b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0))
      createdPath = candidates[0]?.path ?? null
      break
    }
    if (!createdPath) throw new Error('Expected new file from context menu to be created')

    let createdFileBtn: HTMLButtonElement | null = null
    for (let i = 0; i < 80; i += 1) {
      await tick()
      createdFileBtn = findButtonByAriaLabel(container, `File ${createdPath.split('/').pop()}`)
      if (createdFileBtn) break
    }
    if (!createdFileBtn) throw new Error('Created file row button not found')

    await React.act(async () => {
      createdFileBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await tick()
    })
    const staleHeaderDeleteBtn = findButtonByAriaLabel(container, `Delete ${createdPath.split('/').pop()}`)
    if (staleHeaderDeleteBtn) throw new Error('Delete should not remain in Explorer header actions')

    await React.act(async () => {
      createdFileBtn.dispatchEvent(new dom.window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 28,
        clientY: 28,
      }))
      await tick()
    })

    let clearBtn: HTMLButtonElement | null = null
    for (let i = 0; i < 40; i += 1) {
      await tick()
      clearBtn = findButtonByText(container, 'Clear')
      if (clearBtn) break
    }
    if (!clearBtn) throw new Error('Clear context menu item not found')
    await React.act(async () => {
      clearBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await tick()
    })

    await React.act(async () => {
      createdFileBtn.dispatchEvent(new dom.window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 28,
        clientY: 28,
      }))
      await tick()
    })

    let deleteBtn: HTMLButtonElement | null = null
    for (let i = 0; i < 40; i += 1) {
      await tick()
      deleteBtn = findButtonByText(container, 'Delete')
      if (deleteBtn) break
    }
    if (!deleteBtn) throw new Error('Delete context menu item not found')
    await React.act(async () => {
      deleteBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await tick()
    })

    for (let i = 0; i < 80; i += 1) {
      await tick()
      const entries = await fs.listEntries()
      if (!entries.some(e => e.path === createdPath)) {
        createdPath = null
        break
      }
    }
    if (createdPath) throw new Error('Expected created file to be deleted')
  } finally {
    ;(dom.window as unknown as { prompt: typeof prompt }).prompt = prompt
    ;(dom.window as unknown as { confirm: typeof confirm }).confirm = confirm
    try {
      await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 1 })
    } catch {
      void 0
    }
    await cleanupFixture?.()
    persistMarkdownSourceFolderPaths(previousExpanded)
    restoreDom()
  }
}
