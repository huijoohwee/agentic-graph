import { buildWorkspaceWideContextPrompt, selectWorkspaceContextFiles } from '@/features/chat/chatPromptHelpers'

const request = (cacheKey: string, markdownText: string) => buildWorkspaceWideContextPrompt({
  cacheKey, markdownDocumentName: 'request.md', markdownText, sourceFiles: [],
})

export async function testWorkspaceContextUsesCurrentInputWithRepeatedHint() {
  const key = 'workspace-context-freshness-sequential'
  await request(key, 'prior-context-7f48')
  const current = await request(key, 'current-context-c290')
  if (!current?.includes('current-context-c290') || current.includes('prior-context-7f48')) {
    throw new Error('workspace context reused prior document bytes for the same caller hint')
  }
}

export async function testWorkspaceContextConcurrentRequestsKeepTheirOwnInput() {
  const [first, second] = await Promise.all([
    request('workspace-context-freshness-concurrent', 'first-context-c539'),
    request('workspace-context-freshness-concurrent', 'second-context-4ac7'),
  ])
  if (!first?.includes('first-context-c539') || first.includes('second-context-4ac7')
    || !second?.includes('second-context-4ac7') || second.includes('first-context-c539')) {
    throw new Error('concurrent workspace requests substituted another request document')
  }
}

export function testWorkspaceContextSelectionIsBoundedAndStable() {
  const entries = Array.from({ length: 3000 }, (_, index) => ({
    kind: 'file' as const, path: `/workspace/${index}.md`, name: `${index}.md`,
    parentPath: '/workspace', updatedAtMs: index, text: `${index}`,
  }))
  entries.push({ ...entries[2999], text: 'equal timestamp duplicate' })
  entries.push({ ...entries[0], updatedAtMs: 4000, text: 'latest duplicate' })
  const selected = selectWorkspaceContextFiles(entries)
  if (selected.length !== 10 || selected[0].text !== 'latest duplicate'
    || selected[1] !== entries[2999] || selected[9] !== entries[2991]
    || new Set(selected.map(entry => entry.path)).size !== selected.length) {
    throw new Error('bounded workspace selection changed newest-first, stable-tie or unique-path semantics')
  }
}
