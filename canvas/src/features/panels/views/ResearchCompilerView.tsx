import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  RESEARCH_THESIS_AGENTIC_OS_APPLY_OWNER,
  buildResearchThesisReviewAudit,
  compileResearchThesisSpec,
  type ResearchThesisCompileResult,
  type ResearchThesisReviewAudit,
} from '@/features/research-agent/researchThesisContract'
import {
  buildResearchCompilerRequestModel,
  summarizeResearchCompilerResult,
} from '@/features/research-agent/researchCompilerPanelModel'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  uiToolbarRowScrollInlineClassName,
} from '@/features/toolbar/ui/toolbarStyles'
import { PanelTextInput, PanelTextarea } from '@/lib/ui/panelFormControls'

import { MainPanelField, observedFieldHelp } from '../ui/MainPanelField'
import { MainPanelIconButton } from '../ui/MainPanelIconButton'
import { MainPanelTypeIcon } from '../ui/mainPanelHelpIconLibrary'
import CollapsibleSection from '../ui/CollapsibleSection'
import { KeyTypeValueHeader, KeyTypeValueSectionStack } from 'grph-shared/react/keyTypeValueLayout'
import { usePanelTypography } from '@/lib/ui/panelTypography'

const TOKEN_BUDGETS = [
  { label: 'Input tokens', defaultValue: 80_000 },
  { label: 'Output tokens', defaultValue: 12_000 },
] as const
const DEFAULT_RESEARCH_PROMPT = 'Evaluate whether the selected operating thesis is investable from the current workspace sources.'

export default function ResearchCompilerView({ searchQuery = '' }: { searchQuery?: string }) {
  const typography = usePanelTypography()
  const { sourceFiles } = useGraphStore(useShallow(s => ({ sourceFiles: s.sourceFiles || [] })))
  const [prompt, setPrompt] = React.useState(DEFAULT_RESEARCH_PROMPT)
  const [maxInputTokens, setMaxInputTokens] = React.useState<number>(TOKEN_BUDGETS[0].defaultValue)
  const [maxOutputTokens, setMaxOutputTokens] = React.useState<number>(TOKEN_BUDGETS[1].defaultValue)
  const [selectedSourceIds, setSelectedSourceIds] = React.useState<Set<string>>(() => new Set())
  const [compileResult, setCompileResult] = React.useState<ResearchThesisCompileResult | null>(null)
  const [reviewAudit, setReviewAudit] = React.useState<ResearchThesisReviewAudit | null>(null)
  const [acceptedCandidateIds, setAcceptedCandidateIds] = React.useState<Set<string>>(() => new Set())
  const [pending, setPending] = React.useState(false)

  const eligibleSourceFiles = React.useMemo(() => (
    (sourceFiles || []).filter(file => String(file.text || '').trim())
  ), [sourceFiles])

  React.useEffect(() => {
    setSelectedSourceIds(prev => {
      if (prev.size > 0) return prev
      return new Set(eligibleSourceFiles.filter(file => file.enabled !== false).map(file => String(file.id || '')).filter(Boolean))
    })
  }, [eligibleSourceFiles])

  const filteredSourceFiles = React.useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase()
    if (!query) return eligibleSourceFiles
    return eligibleSourceFiles.filter(file => (
      String(file.name || '').toLowerCase().includes(query) ||
      String(file.source?.path || '').toLowerCase().includes(query)
    ))
  }, [eligibleSourceFiles, searchQuery])

  const requestModel = React.useMemo(() => buildResearchCompilerRequestModel({
    thesisPrompt: prompt,
    sourceFiles: eligibleSourceFiles,
    selectedSourceIds,
    maxInputTokens,
    maxOutputTokens,
  }), [eligibleSourceFiles, maxInputTokens, maxOutputTokens, prompt, selectedSourceIds])

  const resultSummary = React.useMemo(() => summarizeResearchCompilerResult(compileResult), [compileResult])

  const candidateNodes = React.useMemo(() => {
    if (!compileResult || compileResult.ok === false) return []
    return compileResult.candidate_delta.graph.nodes
  }, [compileResult])

  React.useEffect(() => {
    if (!compileResult || compileResult.ok === false) return
    setAcceptedCandidateIds(new Set(compileResult.candidate_delta.graph.nodes.slice(0, 1).map(node => node.id)))
    setReviewAudit(null)
  }, [compileResult])

  const runCompile = React.useCallback(async () => {
    setPending(true)
    setReviewAudit(null)
    try {
      const result = await compileResearchThesisSpec(requestModel.request)
      setCompileResult(result)
    } finally {
      setPending(false)
    }
  }, [requestModel.request])

  const buildReview = React.useCallback(() => {
    if (!compileResult || compileResult.ok === false) return
    const accepted = Array.from(acceptedCandidateIds)
    const rejected = candidateNodes.map(node => node.id).filter(id => !acceptedCandidateIds.has(id))
    setReviewAudit(buildResearchThesisReviewAudit({
      spec: compileResult.spec,
      acceptedCandidateIds: accepted,
      rejectedCandidateIds: rejected,
    }))
  }, [acceptedCandidateIds, candidateNodes, compileResult])

  const observed = (label: string, value: React.ReactNode, type = 'string') => <MainPanelField key={label} label={label} type={type} help={observedFieldHelp('Researcher', label, 'review the compiler result before staging any graph change')}>{value}</MainPanelField>
  return (
    <section className={`h-full min-h-0 overflow-y-auto ${typography.panelTextClass}`} data-kg-research-compiler-panel="1" aria-label="Research compiler">
      <KeyTypeValueHeader />
      <KeyTypeValueSectionStack>
        <CollapsibleSection title="Request" defaultCollapsed={false} flushTop>
          <MainPanelField label="Thesis prompt" help={{ role: 'Researcher', actions: ['describe the thesis to evaluate'], outcome: 'scope compilation to a question grounded in the selected sources', value: { key: 'thesisPrompt', type: 'string', defaultValue: DEFAULT_RESEARCH_PROMPT, impact: 'Sets the question compiled from selected workspace sources.' } }}>
            <PanelTextarea aria-label="Thesis prompt" variant="transparent" className={`min-h-24 p-2 ${typography.panelTextClass}`} value={prompt} onChange={event => setPrompt(event.currentTarget.value)} data-kg-research-thesis-prompt="1" />
          </MainPanelField>
          {TOKEN_BUDGETS.map((budget, index) => <MainPanelField key={budget.label} label={budget.label} type="number" help={{ role: 'Researcher', actions: [`cap ${budget.label.toLowerCase()} for this compilation`], outcome: 'bound the requested compiler token budget', value: { key: budget.label, type: 'number', defaultValue: budget.defaultValue, min: 1, max: 'No configured limit', interval: 1, expansionNote: 'More permits a larger budget', contractionNote: 'Fewer reduces the budget', notes: 'No configured upper limit.' } }}>
            <PanelTextInput aria-label={budget.label} variant="transparent" className={`${typography.keyValueInputClass} ${typography.panelTextClass} text-right`} type="number" min={1} step={1} value={index === 0 ? maxInputTokens : maxOutputTokens} onChange={event => (index === 0 ? setMaxInputTokens : setMaxOutputTokens)(Number(event.currentTarget.value))} />
          </MainPanelField>)}
          <MainPanelField label="Compile" type="action" help={{ role: 'Researcher', actions: ['compile the selected sources'], outcome: 'produce a candidate thesis graph for review', value: { key: 'compile', type: 'action', defaultValue: 'Idle', impact: 'Runs on activation when the prompt and source selection are valid.' } }}>
            <MainPanelIconButton iconKey="action.run" label={pending ? 'Running' : 'Compile'} onClick={runCompile} disabled={pending || requestModel.issues.length > 0} data-kg-research-compile-action="1" />
          </MainPanelField>
        </CollapsibleSection>
        <CollapsibleSection title="Source Files" defaultCollapsed={false} actions={<span className={typography.microLabelClass}>{requestModel.selectedSourceCount} selected</span>}>
          <section aria-label="Research source selection" data-kg-research-source-list="1">
            {filteredSourceFiles.slice(0, 12).map(file => {
              const id = String(file.id || '')
              return <MainPanelField key={id} label={String(file.source?.path || file.name || id)} type="boolean" help={{ role: 'Researcher', actions: ['include or exclude this source'], outcome: 'control which workspace evidence enters compilation', value: { key: id, type: 'boolean', defaultValue: file.enabled !== false, impact: 'Checked includes this source; unchecked excludes it.' } }}>
                <input type="checkbox" aria-label={`Include ${String(file.name || id)}`} checked={selectedSourceIds.has(id)} onChange={event => { const checked = event.currentTarget.checked; setSelectedSourceIds(prev => { const next = new Set(prev); if (checked) next.add(id); else next.delete(id); return next }) }} />
              </MainPanelField>
            })}
          </section>
        </CollapsibleSection>
        <CollapsibleSection title="Run" defaultCollapsed={false} actions={resultSummary.status !== 'idle' ? <MainPanelTypeIcon iconKey={resultSummary.status === 'ready' ? 'status.ready' : 'status.error'} className="size-4" /> : null}>
          <section aria-label="Research run status" data-kg-research-run-status="1">
            {observed('Run ID', resultSummary.runId || 'pending')}
            {observed('Claims', resultSummary.claimCount, 'number')}
            {observed('Evidence', resultSummary.evidenceCount, 'number')}
            {observed('Candidates', `${resultSummary.candidateNodeCount} nodes / ${resultSummary.candidateEdgeCount} edges`)}
            {observed('Cache hits', resultSummary.cacheHits, 'number')}
            {observed('Active graph mutated', String(resultSummary.activeGraphMutated), 'boolean')}
            {resultSummary.error ? <p role="alert" className="mt-2 text-red-600">{resultSummary.error}</p> : null}
          </section>
        </CollapsibleSection>
        {candidateNodes.length > 0 ? <CollapsibleSection title="Review" defaultCollapsed={false} actions={<MainPanelIconButton iconKey="action.review" label="Stage" onClick={buildReview} />}>
          <section aria-label="Candidate thesis graph review" data-kg-research-review-surface="1">
            {candidateNodes.slice(0, 8).map(node => <label key={node.id} className={`${uiToolbarRowScrollInlineClassName} gap-2 py-1 ${UI_THEME_TOKENS.text.secondary}`}>
              <input type="checkbox" checked={acceptedCandidateIds.has(node.id)} onChange={event => { const checked = event.currentTarget.checked; setAcceptedCandidateIds(prev => { const next = new Set(prev); if (checked) next.add(node.id); else next.delete(node.id); return next }) }} />
              <span className="min-w-0 flex-1 truncate">{String(node.label || node.id)}</span>
            </label>)}
            {observed('Apply owner', reviewAudit?.apply_owner || RESEARCH_THESIS_AGENTIC_OS_APPLY_OWNER)}
            {observed('Accepted delta', `${reviewAudit?.accepted_delta.nodes.length || 0} nodes / ${reviewAudit?.accepted_delta.edges.length || 0} edges`)}
          </section>
        </CollapsibleSection> : null}
      </KeyTypeValueSectionStack>
    </section>
  )
}
