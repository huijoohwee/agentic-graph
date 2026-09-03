import path from 'node:path'

import { normalizeMarkdownWorkspaceSelectionPath } from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionPath'

const normalizeFsPath = (value: string): string => String(value || '').replace(/\\/g, '/')
const ABSOLUTE_DOCS_VIDEO_DEMO_PATH = normalizeFsPath(
  path.resolve(process.cwd(), '..', '..', 'huijoohwee', 'docs', 'agentic-graph-video-demo.md'),
)

export function testMarkdownWorkspaceSelectionPathKeepsLiveTraceSelectionStable() {
  const normalizedAgenticOs = normalizeMarkdownWorkspaceSelectionPath(
    'chat-log/20260419T180222Z/agentic-os-trace_20260419T180222Z.md' as never,
  )
  if (normalizedAgenticOs !== '/chat-log/20260419T180222Z/agentic-os-trace_20260419T180222Z.md') {
    throw new Error(`expected shared selection path helper to normalize without canonicalizing live AGENTIC_OS trace paths, got ${String(normalizedAgenticOs)}`)
  }

  const unchanged = normalizeMarkdownWorkspaceSelectionPath('/docs/note.md' as never)
  if (unchanged !== '/docs/note.md') {
    throw new Error(`expected ordinary workspace paths to stay stable, got ${String(unchanged)}`)
  }

  const absoluteDocsPath = normalizeMarkdownWorkspaceSelectionPath(
    ABSOLUTE_DOCS_VIDEO_DEMO_PATH as never,
  )
  if (absoluteDocsPath !== '/docs/agentic-graph-video-demo.md') {
    throw new Error(`expected absolute docs-backed selection paths to canonicalize to workspace /docs path, got ${String(absoluteDocsPath)}`)
  }

  const empty = normalizeMarkdownWorkspaceSelectionPath(null)
  if (empty !== null) {
    throw new Error(`expected null selection paths to stay null, got ${String(empty)}`)
  }
}
