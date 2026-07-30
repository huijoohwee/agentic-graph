import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  commitActiveMarkdownBlockEditors,
  registerActiveMarkdownBlockEditor,
} from '@/lib/markdown-core/ui/markdownBlockContainerCore.activeEditor'

export async function testMarkdownWorkspaceFileSwitchWaitsForActiveInlineEditCommit() {
  const order: string[] = []
  const unregister = registerActiveMarkdownBlockEditor(async () => {
    await Promise.resolve()
    order.push('commit')
  })
  const pendingCommit = commitActiveMarkdownBlockEditors()
  if (!pendingCommit) throw new Error('expected an active markdown block editor commit')
  await pendingCommit
  order.push('switch')
  unregister()

  if (order.join('|') !== 'commit|switch' || commitActiveMarkdownBlockEditors() !== null) {
    throw new Error(`expected the active inline editor to commit before document ownership switches, got ${order.join('|')}`)
  }
}

export function testMarkdownWorkspaceSelectionUsesActiveInlineEditCommitBoundary() {
  const selectionText = readFileSync(
    resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceSelection.ts'),
    'utf8',
  )
  const editorText = readFileSync(
    resolve(process.cwd(), 'src', 'lib', 'markdown-core', 'ui', 'MarkdownBlockContainerCore.impl.engine.runtime.tsx'),
    'utf8',
  )
  const viewShellText = readFileSync(
    resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceViewShell.tsx'),
    'utf8',
  )
  const commitIndex = selectionText.indexOf('const pendingCommit = commitActiveMarkdownBlockEditors()')
  const applyIndex = selectionText.indexOf('return pendingCommit.then(applySelection, applySelection)')
  const guardedSelectionIndex = viewShellText.indexOf('const pendingSelection = setSelectionPathSafe(normalized)')
  const activePathHandoffIndex = viewShellText.indexOf('void pendingSelection.then(applyActivePath, applyActivePath)')
  if (
    !editorText.includes('return registerActiveMarkdownBlockEditor(commit)')
    || commitIndex < 0
    || applyIndex < commitIndex
    || guardedSelectionIndex < 0
    || activePathHandoffIndex < guardedSelectionIndex
  ) {
    throw new Error('expected Source Files selection to await the shared active markdown block commit before applying the next selection and active document path')
  }
}
