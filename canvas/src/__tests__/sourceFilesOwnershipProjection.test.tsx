import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  DOCUMENT_REPOSITORY_DISPLAY_ROOTS,
  isKnowgrphWorkspaceSeedsPath,
  isKnowgrphWorkspaceSeedsRootPath,
} from 'grph-shared/collaboration/documentRepositoryAuthority'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'
import { SourceFilesOwnershipSummary } from '@/features/markdown-workspace/SourceFilesOwnershipSummary'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

export async function testSourceFilesOwnershipSummaryRendersCanonicalRoots() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    root.render(<SourceFilesOwnershipSummary />)
    await tick()
    const summary = container.querySelector('[aria-label="Source Files storage ownership"]')
    if (!summary) throw new Error('expected Source Files to render its storage ownership summary')
    const text = String(summary.textContent || '')
    for (const value of Object.values(DOCUMENT_REPOSITORY_DISPLAY_ROOTS)) {
      if (!text.includes(value)) throw new Error(`expected ownership summary to include ${value}`)
    }
  } finally {
    root.unmount()
    restore()
  }
}

export async function testSourceFilesTreeMarksKnowgrphWorkspaceSeedAuthority() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const entries: WorkspaceEntry[] = [
    { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
    { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
    { path: '/docs/workspace-seeds', parentPath: '/docs', kind: 'folder', name: 'workspace-seeds', updatedAtMs: 1 },
  ]
  try {
    root.render(
      <MarkdownFileTree
        entries={entries}
        expandedPaths={new Set(['/docs'])}
        toggleExpanded={() => undefined}
        activePath={null}
        onSelectFile={() => undefined}
        sourcesByPath={null}
      />,
    )
    await tick()
    const marker = container.querySelector('[aria-label="Knowgrph workspace-seed authority"]')
    if (!marker) throw new Error('expected the workspace-seeds folder to expose its Knowgrph authority marker')
    if (!isKnowgrphWorkspaceSeedsPath('/docs/workspace-seeds/demo.md')) {
      throw new Error('expected workspace-seed descendants to retain Knowgrph ownership')
    }
    if (!isKnowgrphWorkspaceSeedsRootPath('/docs/workspace-seeds')
      || isKnowgrphWorkspaceSeedsRootPath('/docs/workspace-seeds/demo.md')) {
      throw new Error('expected only the workspace-seeds boundary folder to receive the authority marker')
    }
  } finally {
    root.unmount()
    restore()
  }
}
