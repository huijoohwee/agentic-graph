import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readRepoFile = (repoRelativePath: string): string =>
  readFileSync(resolve(process.cwd(), '..', repoRelativePath), 'utf8')

export function testManusPrdTadStaysReferenceOnlyUntilSourceOwnersExist(): void {
  const docs = readRepoFile('docs/documents/agentic-graph-manus-prd-tad.md')

  const requiredDocTokens = [
    '**Status**: Reference-only, not implemented',
    'The repo currently has no Manus provider, no Manus widget, no Manus runtime adapter, and no Manus authentication path.',
    'Manus work can be activated later only by adding source owners, tests, and validation that prove the active runtime path.',
    'Required owners before this document can mark Manus implemented',
    'No compatibility remap from inactive draft field names.',
    'Until then, Manus remains an inactive integration reference and must not be presented as shipped behavior in UI, docs, tests, or deployment notes.',
  ]
  for (const token of requiredDocTokens) {
    if (!docs.includes(token)) {
      throw new Error(`Expected Manus PRD/TAD docs to include ${JSON.stringify(token)}`)
    }
  }

  const forbiddenDocTokens = [
    '**Status**: Draft',
    '**Status**: Proposed',
    'CHAT_PROVIDER_MANUS',
    'manusRunGeneration.ts',
    'manusSsot.ts',
    'Manus Agent Task widget',
    'appears in the storyboard widget palette',
    'task.sendMessage is called',
    'Rollback plan',
    'Planned      |',
  ]
  for (const token of forbiddenDocTokens) {
    if (docs.includes(token)) {
      throw new Error(`Expected Manus PRD/TAD docs to remove ${JSON.stringify(token)}`)
    }
  }
}
