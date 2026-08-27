import { isMarkdownWorkspaceDocumentSwitchPending } from '@/lib/markdown-workspace-runtime/markdownWorkspaceDocumentSwitch'

export function testMarkdownWorkspaceDocumentSwitchPendingSuppressesInactiveOwner() {
  const pending = isMarkdownWorkspaceDocumentSwitchPending({
    activePath: '/docs/workspace-readme.md' as never,
    markdownDocumentName: null,
    ownerActive: false,
  })
  if (pending !== false) {
    throw new Error(`expected inactive workspace owner to suppress document-switch pending state, got ${String(pending)}`)
  }
}

export function testMarkdownWorkspaceDocumentSwitchPendingPreservesActiveMismatchCheck() {
  const pending = isMarkdownWorkspaceDocumentSwitchPending({
    activePath: '/docs/workspace-readme.md' as never,
    markdownDocumentName: '/docs/agenticgraph-video-demo.md',
    ownerActive: true,
  })
  if (pending !== true) {
    throw new Error(`expected active workspace owner to keep mismatch pending detection, got ${String(pending)}`)
  }
}

export function testMarkdownWorkspaceDocumentSwitchPendingSkipsDelimitedDataDocuments() {
  const pending = isMarkdownWorkspaceDocumentSwitchPending({
    activePath: '/webset-companies_ai_startups_location_employee_count_latest_funding_funding_date_recent_launches.csv' as never,
    markdownDocumentName: null,
    ownerActive: true,
  })
  if (pending !== false) {
    throw new Error(`expected CSV workspace documents to bypass markdown document-switch placeholder, got ${String(pending)}`)
  }
}

export function testMarkdownWorkspaceDocumentSwitchPendingSkipsJsonDataDocuments() {
  const pending = isMarkdownWorkspaceDocumentSwitchPending({
    activePath: '/docs/rows.json' as never,
    markdownDocumentName: '/docs/other.md',
    ownerActive: true,
  })
  if (pending !== false) {
    throw new Error(`expected JSON workspace documents to bypass markdown document-switch placeholder, got ${String(pending)}`)
  }
}
