import React from 'react'
import { CheckCircle2, Play, SquareCheckBig, XCircle } from 'lucide-react'
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
  uiToolbarButtonMutedClassName,
  uiToolbarButtonPrimarySolidClassName,
  uiToolbarRowScrollInlineClassName,
} from '@/features/toolbar/ui/toolbarStyles'
import { PanelField, PanelReadOnlyField, PanelTextInput, PanelTextarea } from '@/lib/ui/panelFormControls'

const DEFAULT_RESEARCH_PROMPT = 'Evaluate whether the selected operating thesis is investable from the current workspace sources.'

export default function ResearchCompilerView({ searchQuery = '' }: { searchQuery?: string }) {
  const { sourceFiles } = useGraphStore(useShallow(s => ({ sourceFiles: s.sourceFiles || [] })))
  const [prompt, setPrompt] = React.useState(DEFAULT_RESEARCH_PROMPT)
  const [maxInputTokens, setMaxInputTokens] = React.useState(80_000)
  const [maxOutputTokens, setMaxOutputTokens] = React.useState(12_000)
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

  return (
    <section className="h-full min-h-0 overflow-y-auto pr-1" data-kg-research-compiler-panel="1" aria-label="Research compiler">
      <section className="grid gap-3 pb-3">
        <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`}>
          <PanelField label="Thesis prompt" variant="section" layout="compact" labelClassName="font-semibold">
            <PanelTextarea
              variant="transparent"
              className="min-h-24 p-2 text-sm"
              value={prompt}
              onChange={event => setPrompt(event.currentTarget.value)}
              data-kg-research-thesis-prompt="1"
            />
          </PanelField>
          <section className={`${uiToolbarRowScrollInlineClassName} mt-2 gap-2`} aria-label="Research budget">
            <PanelField label="Input tokens" layout="compact" labelClassName="text-[11px] font-semibold">
              <PanelTextInput
                variant="transparent"
                className="w-28 text-sm"
                type="number"
                min={1}
                value={maxInputTokens}
                onChange={event => setMaxInputTokens(Number(event.currentTarget.value))}
              />
            </PanelField>
            <PanelField label="Output tokens" layout="compact" labelClassName="text-[11px] font-semibold">
              <PanelTextInput
                variant="transparent"
                className="w-28 text-sm"
                type="number"
                min={1}
                value={maxOutputTokens}
                onChange={event => setMaxOutputTokens(Number(event.currentTarget.value))}
              />
            </PanelField>
            <button
              type="button"
              className={`App-toolbar__btn ${uiToolbarButtonPrimarySolidClassName} ml-auto`}
              onClick={runCompile}
              disabled={pending || requestModel.issues.length > 0}
              data-kg-research-compile-action="1"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>{pending ? 'Running' : 'Compile'}</span>
            </button>
          </section>
        </section>

        <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`} aria-label="Research source selection">
          <header className={`${uiToolbarRowScrollInlineClassName} justify-between gap-2`}>
            <h3 className={`text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>Source Files</h3>
            <span className={`text-xs ${UI_THEME_TOKENS.text.tertiary}`}>{requestModel.selectedSourceCount} selected</span>
          </header>
          <section className="mt-2 grid gap-1" data-kg-research-source-list="1">
            {filteredSourceFiles.slice(0, 12).map(file => {
              const id = String(file.id || '')
              const checked = selectedSourceIds.has(id)
              return (
                <label key={id || String(file.name || file.source?.path)} className={`${uiToolbarRowScrollInlineClassName} gap-2 rounded px-1 py-1 ${UI_THEME_TOKENS.text.secondary}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={event => {
                      setSelectedSourceIds(prev => {
                        const next = new Set(prev)
                        if (event.currentTarget.checked) next.add(id)
                        else next.delete(id)
                        return next
                      })
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{String(file.source?.path || file.name || id)}</span>
                </label>
              )
            })}
          </section>
        </section>

        <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`} aria-label="Research run status" data-kg-research-run-status="1">
          <header className={`${uiToolbarRowScrollInlineClassName} justify-between gap-2`}>
            <h3 className={`text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>Run</h3>
            {resultSummary.status === 'ready' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : null}
            {resultSummary.status === 'error' ? <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" /> : null}
          </header>
          <section className="mt-2 grid grid-cols-2 gap-2">
            <PanelReadOnlyField label="Run ID" value={resultSummary.runId || 'pending'} valueClassName="truncate font-mono" />
            <PanelReadOnlyField label="Claims" value={resultSummary.claimCount} />
            <PanelReadOnlyField label="Evidence" value={resultSummary.evidenceCount} />
            <PanelReadOnlyField
              label="Candidates"
              value={`${resultSummary.candidateNodeCount} nodes / ${resultSummary.candidateEdgeCount} edges`}
            />
            <PanelReadOnlyField label="Cache hits" value={resultSummary.cacheHits} />
            <PanelReadOnlyField label="Active graph mutated" value={String(resultSummary.activeGraphMutated)} />
          </section>
          {resultSummary.error ? <p className="mt-2 text-xs text-red-600">{resultSummary.error}</p> : null}
        </section>

        {candidateNodes.length > 0 ? (
          <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`} aria-label="Candidate thesis graph review" data-kg-research-review-surface="1">
            <header className={`${uiToolbarRowScrollInlineClassName} justify-between gap-2`}>
              <h3 className={`text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>Review</h3>
              <button type="button" className={`App-toolbar__btn ${uiToolbarButtonMutedClassName}`} onClick={buildReview}>
                <SquareCheckBig className="h-4 w-4" aria-hidden="true" />
                <span>Stage</span>
              </button>
            </header>
            <section className="mt-2 grid gap-1">
              {candidateNodes.slice(0, 8).map(node => {
                const accepted = acceptedCandidateIds.has(node.id)
                return (
                  <label key={node.id} className={`${uiToolbarRowScrollInlineClassName} gap-2 rounded px-1 py-1 ${UI_THEME_TOKENS.text.secondary}`}>
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={event => {
                        setAcceptedCandidateIds(prev => {
                          const next = new Set(prev)
                          if (event.currentTarget.checked) next.add(node.id)
                          else next.delete(node.id)
                          return next
                        })
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{String(node.label || node.id)}</span>
                  </label>
                )
              })}
            </section>
            <section className="mt-2 grid grid-cols-2 gap-2">
              <PanelReadOnlyField
                label="Apply owner"
                value={reviewAudit?.apply_owner || RESEARCH_THESIS_AGENTIC_OS_APPLY_OWNER}
                valueClassName="truncate font-mono"
              />
              <PanelReadOnlyField
                label="Accepted delta"
                value={`${reviewAudit?.accepted_delta.nodes.length || 0} nodes / ${reviewAudit?.accepted_delta.edges.length || 0} edges`}
              />
            </section>
          </section>
        ) : null}
      </section>
    </section>
  )
}
