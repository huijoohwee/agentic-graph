import React from 'react'
import { ArrowRight, Play, Upload } from 'lucide-react'
import {
  buildAgenticOsInvocationChipAttrs,
  buildAgenticOsInvocationChipTitle,
} from '@/features/agentic-os/agenticOsInvocationChips'
import {
  appendLiveCanvasHeroToken,
  buildLiveCanvasHeroModel,
  liveCanvasHeroQueryHasToken,
  type LiveCanvasHeroModel,
} from '@/features/agentic-os/liveCanvasHeroModel'
import { readLiveCanvasHeroContent } from '@/features/agentic-os/liveCanvasHeroContent'
import {
  isTrustedCanvasEmbedMessageSource,
  resolveCanvasEmbedImport,
} from '@/features/canvas/canvasEmbedImportContract'
import { CanvasEmbedImportPanel } from '@/features/canvas/CanvasEmbedImportPanel'
import { selectLiveCanvasHeroSource } from '@/features/canvas/liveCanvasHeroSourceSelection'
import { submitToEmbeddedCanvasChat } from '@/features/canvas/embeddedCanvasChatCommand'
import type { LiveCanvasHeroSource } from '@/features/canvas/useKnowgrphLiveCanvasHero'
import type { SourceFile } from '@/hooks/store/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { normalizeInvocationTokenSpacing } from '@/lib/markdown/invocationTokens'
import { resolveLiveCanvasHeroEnterHref } from '@/lib/routing/basePath'
import {
  GENERATION_KIND_INVOCATIONS,
  GENERATION_PROVIDER_INVOCATIONS,
  parseGenerationInvocation,
  setGenerationKinds,
  setGenerationProvider,
  setGenerationSpecification,
  type GenerationSpecification,
} from '@/features/chat/generationInvocation'
import { LiveCanvasHeroQueryEditor } from '@/features/agentic-os/LiveCanvasHeroQueryEditor'
import { LiveCanvasHeroPromptPresetPicker } from '@/features/agentic-os/LiveCanvasHeroPromptPresetPicker'
import {
  liveCanvasHeroPromptHasParameter,
  readLiveCanvasHeroPromptParameters,
  toggleLiveCanvasHeroPromptParameter,
} from '@/features/agentic-os/liveCanvasHeroPromptParameters'
import type { PromptPresetSelectionRuntime } from '@/features/chat/promptPresetSelectionRuntime'

export type LiveCanvasHeroProps = {
  onEnter?: () => void
  sourceFiles?: readonly SourceFile[]
}

type LiveCanvasHeroShellProps = LiveCanvasHeroProps & {
  source: LiveCanvasHeroSource
}

type ReadyLiveCanvasHeroModel = Extract<LiveCanvasHeroModel, { status: 'ready' }>

type LiveCanvasHeroEditorialProps = LiveCanvasHeroProps & {
  model: ReadyLiveCanvasHeroModel
  promptPresetsRuntime?: PromptPresetSelectionRuntime
}

const heroActionControlClassName = 'inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--kg-border)] bg-[color-mix(in_srgb,var(--kg-panel-bg)_72%,transparent)] p-2.5 text-[var(--kg-text-primary)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-canvas-accent)] disabled:cursor-wait disabled:opacity-60'

function renderHeroInlineCodeText(text: string): React.ReactNode {
  return text.split(/(`[^`]+`)/g).map((segment, index) => {
    if (segment.startsWith('`') && segment.endsWith('`')) {
      return (
        <span key={`${segment}:${index}`} className="font-mono text-[var(--kg-text-primary)]">
          {segment.slice(1, -1)}
        </span>
      )
    }
    return <React.Fragment key={`${segment}:${index}`}>{segment}</React.Fragment>
  })
}

export function LiveCanvasHeroEditorial(props: LiveCanvasHeroEditorialProps) {
  const { model } = props
  const content = React.useMemo(readLiveCanvasHeroContent, [])
  const [draft, setDraft] = React.useState(model.defaultQuery)
  const [selectedPromptPresetId, setSelectedPromptPresetId] = React.useState('video-agent')
  const [selectedPromptPresetPrompt, setSelectedPromptPresetPrompt] = React.useState(model.defaultQuery)
  const previousDefaultQueryRef = React.useRef(model.defaultQuery)
  const [errorText, setErrorText] = React.useState('')
  const [importPanelOpen, setImportPanelOpen] = React.useState(false)
  const invocation = React.useMemo(() => parseGenerationInvocation(draft), [draft])
  const selectedKinds = invocation?.kinds || []
  const promptParameters = React.useMemo(
    () => readLiveCanvasHeroPromptParameters(selectedPromptPresetPrompt),
    [selectedPromptPresetPrompt],
  )

  React.useEffect(() => {
    const previous = previousDefaultQueryRef.current
    previousDefaultQueryRef.current = model.defaultQuery
    setDraft(current => current === previous ? model.defaultQuery : current)
    setSelectedPromptPresetPrompt(current => current === previous ? model.defaultQuery : current)
  }, [model.defaultQuery])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedCanvasEmbedMessageSource(event)) return
      const selection = resolveCanvasEmbedImport(event.data)
      if (selection) selectLiveCanvasHeroSource(selection)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = normalizeInvocationTokenSpacing(draft.trim())
    if (!query) {
      setErrorText('Enter an agent-ready query before running the canvas.')
      return
    }
    setErrorText('')
    if (!submitToEmbeddedCanvasChat(query)) {
      setErrorText('The canvas Chat surface is not ready. Keep the query here and try again.')
      return
    }
  }

  return (
    <section
      className="pointer-events-none absolute inset-0 z-[40] overflow-hidden text-[var(--kg-text-primary)]"
      aria-labelledby="knowgrph-live-canvas-hero-title"
      data-kg-live-canvas-hero="true"
      data-kg-live-canvas-hero-state="ready"
      data-kg-live-canvas-hero-layout="overlay-on-canvas"
    >
      <section
        className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--kg-canvas-bg)_14%,transparent)_25%,color-mix(in_srgb,var(--kg-canvas-bg)_92%,transparent)_56%,var(--kg-canvas-bg)_100%)] md:hidden"
        aria-hidden="true"
      />
      <section
        className="absolute inset-0 hidden bg-[linear-gradient(90deg,color-mix(in_srgb,var(--kg-canvas-bg)_96%,transparent)_0%,color-mix(in_srgb,var(--kg-canvas-bg)_82%,transparent)_34%,color-mix(in_srgb,var(--kg-canvas-bg)_16%,transparent)_60%,transparent_72%)] md:block"
        aria-hidden="true"
      />
      <section
        className="absolute -left-48 bottom-[-18rem] h-[38rem] w-[38rem] rounded-full bg-[color-mix(in_srgb,var(--kg-canvas-accent)_10%,transparent)] blur-3xl md:bottom-auto md:top-1/2 md:h-[46rem] md:w-[46rem] md:-translate-y-1/2"
        aria-hidden="true"
      />

      <article
        className="pointer-events-auto absolute bottom-[calc(var(--kg-safe-bottom,0px)+var(--kg-canvas-viewport-edge-gap,12px)+var(--kg-toolbar-compact-surface-height,38px)+12px)] left-4 right-4 flex max-h-[calc(100dvh-var(--kg-main-toolbar-height,38px)-var(--kg-toolbar-compact-surface-height,38px)-4rem)] flex-col overflow-y-auto pr-1 md:bottom-auto md:left-8 md:right-auto md:top-1/2 md:w-[min(34rem,calc(100%-4rem))] md:max-h-[calc(100dvh-var(--kg-main-toolbar-height,38px)-2.5rem)] md:-translate-y-1/2 lg:left-12 lg:w-[34rem]"
        data-kg-live-canvas-hero-editorial="overlay"
      >
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--kg-text-secondary)]">
          <span
            className="h-3 w-3 shrink-0 bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/favicon.svg?v=airvio')" }}
            aria-hidden="true"
            data-kg-live-canvas-hero-brand-mark="airvio-favicon"
          />
          {content.eyebrow}
        </p>
        <h1 id="knowgrph-live-canvas-hero-title" className="mt-3 text-balance text-3xl font-semibold leading-[1.02] tracking-[-0.045em] md:mt-4 md:text-5xl lg:text-[3.5rem]">
          <span className="block">{content.headline[0]}</span>
          <span className="block">{content.headline[1]}</span>
          <span className="block text-[var(--kg-canvas-accent)]">{content.headline[2]}</span>
        </h1>
        <p className="mt-4 max-w-[34rem] text-sm leading-6 text-[var(--kg-text-secondary)] sm:text-base">
          {renderHeroInlineCodeText(content.lede)}
        </p>

        <form
          className="mt-4 flex h-[29rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-[color:var(--kg-border)] bg-[color-mix(in_srgb,var(--kg-panel-bg)_72%,transparent)] p-3 shadow-[0_18px_64px_color-mix(in_srgb,var(--kg-canvas-bg)_72%,transparent)] backdrop-blur-xl md:mt-6 md:p-4"
          onSubmit={handleSubmit}
          data-kg-live-canvas-hero-command-deck="true"
        >
          <LiveCanvasHeroPromptPresetPicker
            activePresetId={selectedPromptPresetId}
            runtime={props.promptPresetsRuntime}
            onSelect={selection => {
              setSelectedPromptPresetId(selection.id)
              setSelectedPromptPresetPrompt(selection.prompt)
              setDraft(selection.prompt)
              setErrorText('')
            }}
          />
          <label className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--kg-text-secondary)]" htmlFor="knowgrph-live-canvas-hero-query">
            Prompt Presets
          </label>
          <LiveCanvasHeroQueryEditor value={draft} onChange={setDraft} />
          {selectedPromptPresetId === 'video-agent' && model.sourceLabel ? <p className="mt-2 truncate text-[10px] text-[var(--kg-text-secondary)]" title={model.sourceWorkspacePath || model.sourceLabel}>Script: {model.sourceLabel}</p> : null}
          <section className="mt-3 h-24 shrink-0 overflow-y-auto overscroll-contain pr-1" aria-label="Prompt preset controls" data-kg-live-canvas-hero-prompt-controls-scroll="fixed">
            <section className="grid gap-2">
            {!invocation && promptParameters.length ? (
              <fieldset className="h-16 overflow-hidden" data-kg-live-canvas-hero-prompt-parameters="true">
                <legend className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--kg-text-secondary)]">
                  Parameters
                </legend>
                <nav className="mt-1 flex max-h-11 flex-wrap gap-1.5 overflow-y-auto overscroll-contain pr-1" aria-label="Prompt parameters">
                  {promptParameters.map(parameter => {
                    const active = liveCanvasHeroPromptHasParameter(draft, parameter)
                    return (
                      <button
                        key={parameter}
                        type="button"
                        className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-canvas-accent)] ${active ? 'border-[var(--kg-canvas-accent)] bg-[color-mix(in_srgb,var(--kg-canvas-accent)_16%,transparent)] text-[var(--kg-text-primary)]' : 'border-[color:var(--kg-border)] bg-[color:var(--kg-panel-bg)]/70 text-[var(--kg-text-secondary)] hover:text-[var(--kg-text-primary)]'}`}
                        aria-pressed={active}
                        title={`${active ? 'Remove' : 'Add'} ${parameter}`}
                        data-kg-live-canvas-hero-prompt-parameter={parameter}
                        onClick={() => setDraft(current => toggleLiveCanvasHeroPromptParameter(current, parameter))}
                      >
                        {parameter}
                      </button>
                    )
                  })}
                </nav>
              </fieldset>
            ) : null}
            {invocation ? (
              <section className="grid gap-2" aria-label="Video prompt invocation controls">
                {(['Route', 'Provider', 'Specification', 'Outputs'] as const).map(group => <fieldset key={group} data-kg-live-canvas-hero-invocation-group={group.toLowerCase()}>
                  <legend className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--kg-text-secondary)]">{group}</legend>
                  <nav className="mt-1 flex flex-wrap gap-1.5" aria-label={`${group} invocations`}>{model.invocations.filter(invocation => invocation.group === group).map(invocation => {
                    const active = liveCanvasHeroQueryHasToken(draft, invocation.token)
                    const attrs = buildAgenticOsInvocationChipAttrs(invocation.token) || {}
                    return (
                      <button
                        key={invocation.token}
                        type="button"
                        className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-canvas-accent)] ${active ? 'border-[var(--kg-canvas-accent)] bg-[color-mix(in_srgb,var(--kg-canvas-accent)_16%,transparent)] text-[var(--kg-text-primary)]' : 'border-[color:var(--kg-border)] bg-[color:var(--kg-panel-bg)]/70 text-[var(--kg-text-secondary)] hover:text-[var(--kg-text-primary)]'}`}
                        aria-pressed={active}
                        title={buildAgenticOsInvocationChipTitle(invocation.token) || invocation.summary}
                        data-kg-live-canvas-hero-invocation-token={invocation.token}
                        onClick={() => setDraft(current => {
                          const providerOption = GENERATION_PROVIDER_INVOCATIONS.find(item => item.token === invocation.token)
                          if (providerOption) return setGenerationProvider(current, providerOption.provider)
                          if (invocation.token.startsWith('#spec.')) return setGenerationSpecification(current, invocation.token.slice('#spec.'.length) as GenerationSpecification)
                          const kindOption = GENERATION_KIND_INVOCATIONS.find(item => item.token === invocation.token)
                          if (kindOption) {
                            const next = selectedKinds.includes(kindOption.kind) ? selectedKinds.filter(kind => kind !== kindOption.kind) : [...selectedKinds, kindOption.kind]
                            return next.length ? setGenerationKinds(current, next) : current
                          }
                          return appendLiveCanvasHeroToken(current, invocation.token)
                        })}
                        {...attrs}
                      >
                        {invocation.token}
                      </button>
                    )
                  })}</nav>
                </fieldset>)}
              </section>
            ) : null}
            </section>
          </section>

          <section className="mt-auto flex shrink-0 flex-wrap items-center gap-2">
            <a
              href={resolveLiveCanvasHeroEnterHref(import.meta.env?.BASE_URL)}
              onClick={props.onEnter}
              className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--kg-canvas-accent)] bg-[var(--kg-canvas-accent)] p-2.5 text-slate-950 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-canvas-accent)]"
              aria-label="Enter Knowgrph"
              title="Enter Knowgrph"
              data-kg-live-canvas-hero-enter="true"
            >
              <ArrowRight className="h-4 w-4" aria-label="Enter Knowgrph icon" data-kg-live-canvas-hero-action-icon="enter" />
            </a>
            <button
              type="submit"
              className={heroActionControlClassName}
              aria-label="Run all"
              title="Run all"
              data-kg-live-canvas-hero-start="true"
            >
              <Play className="h-4 w-4" aria-label="Run icon" data-kg-live-canvas-hero-action-icon="run" />
            </button>
            <button
              type="button"
              onClick={() => setImportPanelOpen(true)}
              className={heroActionControlClassName}
              aria-label="Import canvas embed"
              title="Import canvas embed"
              data-kg-live-canvas-hero-import-embed="true"
            >
              <Upload className="h-4 w-4" aria-label="Import canvas embed icon" data-kg-live-canvas-hero-action-icon="import" />
            </button>
            <kbd className="rounded-md border border-[color:var(--kg-border)] px-2 py-1 font-mono text-[10px] text-[var(--kg-text-secondary)]" title="Start locally shortcut">Ctrl/⌘↵</kbd>
          </section>
          {errorText ? <p className="mt-2 text-xs text-red-500" role="alert">{errorText}</p> : null}
        </form>

        <ul className="mt-3 hidden flex-wrap gap-2 text-[10px] text-[var(--kg-text-secondary)] md:flex" aria-label="Agent-ready execution posture">
          {content.posture.map(label => (
            <li key={label} className="rounded-full border border-[color:var(--kg-border)] bg-[color-mix(in_srgb,var(--kg-panel-bg)_54%,transparent)] px-2.5 py-1 backdrop-blur-md">
              {label}
            </li>
          ))}
        </ul>
      </article>
      {importPanelOpen ? <CanvasEmbedImportPanel onClose={() => setImportPanelOpen(false)} /> : null}
    </section>
  )
}

export function LiveCanvasHero(props: LiveCanvasHeroShellProps) {
  const model = React.useMemo(() => buildLiveCanvasHeroModel({ sourceFiles: props.sourceFiles }), [props.sourceFiles])
  const requestZoom = useGraphStore(state => state.requestZoom)
  React.useEffect(() => {
    let secondFrameId = 0
    const firstFrameId = requestAnimationFrame(() => {
      secondFrameId = requestAnimationFrame(() => {
        requestZoom('fit', { intent: 'fitToView' })
      })
    })
    return () => {
      cancelAnimationFrame(firstFrameId)
      if (secondFrameId) cancelAnimationFrame(secondFrameId)
    }
  }, [props.source.sourceLayerHash, requestZoom])
  return (
    <section
      className="pointer-events-none absolute inset-0 z-[40] overflow-hidden"
      aria-label="Knowgrph Live Canvas Hero"
      data-kg-live-canvas-hero-shell="full-bleed"
      data-kg-live-canvas-hero-source={props.source.sourcePath}
      data-kg-live-canvas-hero-source-graph-id={props.source.graphId || undefined}
      data-kg-live-canvas-hero-source-revision={props.source.graphRevision}
      data-kg-live-canvas-hero-source-schema={props.source.schema || undefined}
    >
      <LiveCanvasHeroEditorial {...props} model={model} />
    </section>
  )
}
