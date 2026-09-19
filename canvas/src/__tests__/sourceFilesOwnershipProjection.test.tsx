import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { DASHBOARD_TEMPLATE_DISPLAY_ROOT, DASHBOARD_TEMPLATE_PATH } from '@/components/DashboardCanvas/dashboardTemplateSource'
import { projectWorkspaceEntriesToSourceFilesExplorer, resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
import {
  DOCUMENT_REPOSITORY_DISPLAY_ROOTS,
  isAgenticGraphWorkspaceSeedsPath,
  isAgenticGraphWorkspaceSeedsRootPath,
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
    let opened = false
    flushSync(() => root.render(<SourceFilesOwnershipSummary onOpenTemplate={() => { opened = true }} />))
    const summary = container.querySelector('[aria-label="Source Files storage ownership"]')
    if (!summary) throw new Error('expected Source Files to render its storage ownership summary')
    const text = String(summary.textContent || '')
    for (const value of Object.values(DOCUMENT_REPOSITORY_DISPLAY_ROOTS)) {
      if (!text.includes(value)) throw new Error(`expected ownership summary to include ${value}`)
    }
    const templates = summary.querySelector<HTMLButtonElement>(`[aria-label="Open ${DASHBOARD_TEMPLATE_DISPLAY_ROOT}"]`)
    if (!templates) throw new Error('expected shared templates to be discoverable before caching')
    templates.click()
    if (!opened) throw new Error('expected the shared template to open through Source Files')
    const paths = ['/huijoohwee.github.io', '/huijoohwee.github.io/template', DASHBOARD_TEMPLATE_PATH, '/docs/dashboards/reference.input.json', '/docs/dashboards/reference.md']
    const entries: WorkspaceEntry[] = paths.map((path, index) => ({ path, parentPath: path.slice(0, path.lastIndexOf('/')) || '/', name: path.split('/').pop()!, kind: index < 2 ? 'folder' : 'file', updatedAtMs: 1 }))
    if (projectWorkspaceEntriesToSourceFilesExplorer(entries, resolveWorkspaceSourceRootPaths()).length !== entries.length) throw new Error('expected all three dashboard files and template ancestors to survive the Source Files root filter')
  } finally {
    root.unmount()
    restore()
  }
}

export async function testSourceFilesTreeMarksAgenticGraphWorkspaceSeedAuthority() {
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
    const marker = container.querySelector('[aria-label="agentic-graph workspace-seed authority"]')
    if (!marker) throw new Error('expected the workspace-seeds folder to expose its agentic-graph authority marker')
    if (!isAgenticGraphWorkspaceSeedsPath('/docs/workspace-seeds/demo.md')) {
      throw new Error('expected workspace-seed descendants to retain agentic-graph ownership')
    }
    if (!isAgenticGraphWorkspaceSeedsRootPath('/docs/workspace-seeds')
      || isAgenticGraphWorkspaceSeedsRootPath('/docs/workspace-seeds/demo.md')) {
      throw new Error('expected only the workspace-seeds boundary folder to receive the authority marker')
    }
  } finally {
    root.unmount()
    restore()
  }
}
