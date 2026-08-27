import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(process.cwd(), '..')
const readRepoFile = (repoRelativePath: string): string =>
  readFileSync(resolve(repoRoot, repoRelativePath), 'utf8')

export function testResearchAgentPrdTadUsesImplementedDevSourceOwners(): void {
  const oldPath = resolve(repoRoot, 'docs/documents/agenticgraph-research-agent-prd-tad-proposed.md')
  if (existsSync(oldPath)) {
    throw new Error('Expected research-agent PRD/TAD to remove the proposed document path')
  }

  const docs = readRepoFile('docs/documents/agenticgraph-research-agent-prd-tad.md')

  const requiredDocTokens = [
    'doc_id: agenticgraph-research-agent-prd-tad',
    'status: dev-source-implemented-no-deploy',
    'implemented dev-source research-thesis baseline',
    'canvas/src/features/research-agent/researchThesisContract.ts',
    'canvas/src/features/panels/views/ResearchCompilerView.tsx',
    'canvas/src/features/research-agent/researchCompilerPanelModel.ts',
    'cloudflare/workers/agenticgraph-research/index.ts',
    'cloudflare/d1/migrations/0005_research_thesis.sql',
    'injectable KV summary-cache adapter',
    'without hardcoded namespace ids',
    'active_graph_mutated: false',
    'must not be presented as a live `airvio.co` capability',
    'whose node/edge counts match the parsed frontmatter instead of fixture literals',
    'agentReady.localMainPanelChatCanvasPipeline.renderedMcpResearchAgentDemoSuperAgentStoryboardWidget',
    'agentReady.localMainPanelChatCanvasPipeline.researchAgentDemoSuperAgentStoryboardWidget',
  ]
  for (const token of requiredDocTokens) {
    if (!docs.includes(token)) {
      throw new Error(`Expected research-agent PRD/TAD docs to include ${JSON.stringify(token)}`)
    }
  }

  const forbiddenDocTokens = [
    'prd-tad-proposed',
    'status: proposed',
    'status: reference-only-not-implemented',
    'PRD + TAD (Proposed)',
    'reference-only contract',
    '{{doc_id}}',
    'scripts/kgc_seed.py',
    'KGCSeedPipeline',
    'KGCReasoner',
    'KGCSkillLoop',
    'KGCSimulator',
    'Claude Haiku',
    'Claude Sonnet',
    'data/seeds/',
    'data/skills/',
    'no native research-agent seeder',
    'Not yet surfaced',
    'visible overlay remains future UI work',
    'dev-source-research-thesis-cache',
    'parses warning-clean to 22 nodes and 19 edges',
    'parses warning-clean to 16 nodes and 13 edges',
  ]
  for (const token of forbiddenDocTokens) {
    if (docs.includes(token)) {
      throw new Error(`Expected research-agent PRD/TAD docs to remove ${JSON.stringify(token)}`)
    }
  }
}
