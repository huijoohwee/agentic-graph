import assert from 'node:assert/strict'
import { collectInlineKeywordCommandCandidates } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { getAgenticOsDocInvocations } from '@/features/agentic-os/agenticOsDocInvocations'
import {
  registerAgenticOsRemoteGrammarCatalogEntries as register,
  resetAgenticOsRemoteGrammarCatalogForTests as reset,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'

export function testInlineKeywordCommandsReuseCompleteDashboardKeywordContext(): void {
  reset()
  try {
    const dashboardKeywords = Array.from({ length: 36 }, (_, index) => `Reusabletype${String(index).padStart(2, '0')}`)
    const expectedLabels = [...dashboardKeywords, 'Strybldrimagesource', 'Storyboardframe', 'Storyboardelement', 'Fork', 'Review', 'Publish']
    const draftText = expectedLabels.map(label => `#${label}`).join('\n')
    const sourcePath = 'https://catalog.example/semantic-dictionary'
    const collect = () => collectInlineKeywordCommandCandidates({ draftText })
    const cold = collect()
    assert.ok(!cold.some(candidate => candidate.token === '#paid-resource-review'))
    register([{ token: '#paid-resource-review', kind: 'semantic', label: 'Paid resource review', sourcePath }])
    const candidates = collect()
    const labels = new Set(candidates.map(candidate => candidate.label))
    for (const label of [...expectedLabels, ...getAgenticOsDocInvocations().map(doc => doc.label), 'Paid resource review']) {
      assert.ok(labels.has(label), `expected complete inline keyword menu to include ${label}`)
    }
    assert.ok(candidates.find(candidate => candidate.token === '#paid-resource-review')?.keywords.includes(sourcePath))
    assert.equal(new Set(candidates.map(candidate => candidate.token)).size, candidates.length)
    assert.equal(collectInlineKeywordCommandCandidates({ draftText, limit: 24 }).length, 24)
    reset()
    assert.ok(!collect().some(candidate => candidate.token === '#paid-resource-review'))
  } finally { reset() }
}
