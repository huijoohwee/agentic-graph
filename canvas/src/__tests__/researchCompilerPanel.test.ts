import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  RESEARCH_THESIS_KGC_APPLY_OWNER,
  buildResearchThesisReviewAudit,
  compileResearchThesisSpec,
} from '@/features/research-agent/researchThesisContract'
import {
  buildResearchCompilerRequestModel,
  readResearchCompilerSourcePath,
  summarizeResearchCompilerResult,
} from '@/features/research-agent/researchCompilerPanelModel'

const repoRoot = resolve(process.cwd(), '..')
const readRepoFile = (repoRelativePath: string): string =>
  readFileSync(resolve(repoRoot, repoRelativePath), 'utf8')

export async function testResearchCompilerPanelBuildsSourceFileBackedReviewSurface() {
  const sourceFiles = [
    {
      id: 'sf-enabled',
      name: 'enabled.md',
      enabled: true,
      text: 'Operating evidence supports growth but margin pressure remains open.',
      source: { path: 'workspace:/docs/enabled.md' },
    },
    {
      id: 'sf-disabled',
      name: 'disabled.md',
      enabled: false,
      text: 'Disabled source should not enter the compile request.',
      source: { path: 'workspace:/docs/disabled.md' },
    },
  ]
  if (readResearchCompilerSourcePath(sourceFiles[0]) !== 'workspace:/docs/enabled.md') {
    throw new Error('expected research compiler source model to preserve Source Files canonical path')
  }

  const requestModel = buildResearchCompilerRequestModel({
    thesisPrompt: 'Evaluate whether the selected operating thesis is investable.',
    sourceFiles,
    maxInputTokens: 80_000,
    maxOutputTokens: 12_000,
  })
  if (requestModel.issues.length > 0) throw new Error(`expected valid research compiler request model, got ${requestModel.issues.join(',')}`)
  if (requestModel.selectedSourceCount !== 1 || requestModel.request.sources?.[0]?.canonicalPath !== 'workspace:/docs/enabled.md') {
    throw new Error(`expected enabled Source Files selection to drive compile request, got ${JSON.stringify(requestModel)}`)
  }
  const emptySelectionModel = buildResearchCompilerRequestModel({
    thesisPrompt: 'Evaluate whether the selected operating thesis is investable.',
    sourceFiles,
    selectedSourceIds: new Set(),
    maxInputTokens: 80_000,
    maxOutputTokens: 12_000,
  })
  if (emptySelectionModel.selectedSourceCount !== 0 || !emptySelectionModel.issues.includes('sourceSelection')) {
    throw new Error(`expected explicit empty Source Files selection to stay empty, got ${JSON.stringify(emptySelectionModel)}`)
  }

  const result = await compileResearchThesisSpec(requestModel.request)
  const summary = summarizeResearchCompilerResult(result)
  if (result.ok === false || summary.status !== 'ready') {
    throw new Error(`expected research compiler panel request to compile, got ${JSON.stringify(summary)}`)
  }
  if (summary.activeGraphMutated !== false || summary.candidateNodeCount < 1) {
    throw new Error(`expected visible review summary to stay staged, got ${JSON.stringify(summary)}`)
  }
  const acceptedId = result.candidate_delta.graph.nodes[0]?.id || ''
  const audit = buildResearchThesisReviewAudit({
    spec: result.spec,
    acceptedCandidateIds: [acceptedId],
    rejectedCandidateIds: result.candidate_delta.graph.nodes.slice(1).map(node => node.id),
  })
  if (audit.apply_owner !== RESEARCH_THESIS_KGC_APPLY_OWNER || audit.active_graph_mutated !== false) {
    throw new Error(`expected visible review to prepare the existing KGC apply owner without active mutation, got ${JSON.stringify(audit)}`)
  }
}

export function testResearchCompilerMainPanelTabUsesSharedSourceOwners() {
  const mainPanelTabs = readRepoFile('canvas/src/features/panels/mainPanelTabs.ts')
  const mainPanel = readRepoFile('canvas/src/features/panels/MainPanel.tsx')
  const iconLibrary = readRepoFile('canvas/src/features/panels/ui/mainPanelHelpIconLibrary.tsx')
  const view = readRepoFile('canvas/src/features/panels/views/ResearchCompilerView.tsx')
  const ownerMap = readRepoFile('canvas/src/features/research-agent/researchThesisTypes.ts')
  const tabsDoc = readRepoFile('docs/documents/agentic-graph-mainpanel-tabs.md')
  const wrangler = readRepoFile('cloudflare/workers/agentic-graph-research/wrangler.toml')

  const required = [
    [mainPanelTabs, "| 'research'"],
    [mainPanelTabs, "key: 'research'"],
    [mainPanel, "React.lazy(() => import('./views/ResearchCompilerView'))"],
    [mainPanel, 'id="main-panel-research-panel"'],
    [iconLibrary, "'mainPanel.research'"],
    [tabsDoc, '| research | mainPanel.research |'],
    [view, 'data-kg-research-compiler-panel="1"'],
    [view, 'data-kg-research-source-list="1"'],
    [view, 'data-kg-research-review-surface="1"'],
    [view, 'useGraphStore'],
    [view, 'sourceFiles'],
    [view, 'compileResearchThesisSpec'],
    [view, 'buildResearchCompilerRequestModel'],
    [view, 'buildResearchThesisReviewAudit'],
    [ownerMap, 'canvas/src/features/research-agent/researchCompilerPanelModel.ts'],
    [ownerMap, 'canvas/src/features/panels/views/ResearchCompilerView.tsx'],
  ] as const
  for (const [text, token] of required) {
    if (!text.includes(token)) throw new Error(`expected Research Compiler source owner token ${JSON.stringify(token)}`)
  }
  for (const forbidden of ['scripts/kgc_seed.py', 'KGCReasoner', 'KGCSimulator']) {
    if (view.includes(forbidden) || ownerMap.includes(forbidden)) {
      throw new Error(`expected Research Compiler panel to avoid legacy research owner ${forbidden}`)
    }
  }
  if (wrangler.includes('dev-source-research-thesis-cache')) {
    throw new Error('expected Research Worker source to avoid fake Cloudflare KV namespace ids')
  }
}
