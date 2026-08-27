import React from 'react'
import {
  Armchair,
  ArrowUp,
  Boxes,
  Car,
  ChevronDown,
  CircleDot,
  Crosshair,
  CupSoda,
  Music2,
  Spade,
  Swords,
  type LucideIcon,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useSourceFilesBootstrapReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { downloadBlob } from '@/lib/graph/save'
import {
  FloatingPanelCatalogHeader,
  FloatingPanelCatalogSearchControl,
  floatingPanelCatalogBodyClassName,
  floatingPanelCatalogSurfaceClassName,
  floatingPanelCatalogThreeRowClassName,
  floatingPanelCatalogThreeRowThumbnailFrameClassName,
  matchesFloatingPanelCatalogSearch,
  useFloatingPanelCatalogSearch,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import { useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { splitInvocationTokenSegments } from '@/lib/markdown/invocationTokens'
import { cn } from '@/lib/utils'
import ExpandCollapseAllButton from '@/features/panels/ui/ExpandCollapseAllButton'
import { useCollapsibleSectionGroup } from '@/features/panels/ui/useCollapsibleSectionGroup'
import { FlightSimTrainingSurfaceProjection } from '@/features/game-flight-sim/FlightSimTrainingSurfaceProjection'
import {
  XR_ANIMATION_PRESETS,
  xrAnimationPresetCompatible,
  type XrAnimationPreset,
} from './xrAnimationCatalog'
import {
  buildXrAnimationInvocation,
  controlLocalAnimation,
  inspectLocalAnimation,
} from './xrAnimationMcpRuntime'
import {
  XR_ANIMATION_INVOCATION_BINDINGS,
  XR_ANIMATION_INVOCATION_COMMANDS,
  XR_ANIMATION_INVOCATION_SEMANTICS,
} from './xrAnimationMcpContract.mjs'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from './xrMotionReferenceRuntime'
import { readBoundXrSelectedActorId } from './xrSelectedActorBinding'
import {
  xrMotionReferencePackageBlob,
  xrMotionReferencePackageFilename,
} from './xrMotionReferencePackage'
import { XrChoreographyInspector } from './XrChoreographyInspector'
import { resolveXrSceneDocumentReady } from './xrSceneDocumentReadiness'

const XR_ANIMATION_GRAMMAR_SIGILS = ['/', '#', '@'] as const
const XR_ANIMATION_REQUIRED_METADATA_TOKENS = Object.freeze([
  ...Object.values(XR_ANIMATION_INVOCATION_COMMANDS).map(token => ({ kind: 'command' as const, token })),
  ...Object.values(XR_ANIMATION_INVOCATION_SEMANTICS).map(token => ({ kind: 'semantic' as const, token })),
  ...Object.values(XR_ANIMATION_INVOCATION_BINDINGS).map(token => ({ kind: 'binding' as const, token })),
])

const PRESET_ICON_BY_ID: Readonly<Record<XrAnimationPreset['id'], LucideIcon>> = {
  fight: Swords,
  dance: Music2,
  sit: Armchair,
  drink: CupSoda,
  jump: ArrowUp,
  'play-cards': Spade,
  'squirt-gun': Crosshair,
  'helicopter-orbit': CircleDot,
  'car-chase': Car,
  'collapsing-debris': Boxes,
}

function AnimationInvocationChips({
  active = true,
  invocation,
  surface,
}: {
  active?: boolean
  invocation: string
  surface: 'action' | 'details'
}) {
  const displayInvocation = invocation || 'Catalog hydrating…'
  const compactInvocation = invocation
    ? splitInvocationTokenSegments(invocation)
      .filter(segment => segment.kind === 'token')
      .map(segment => segment.value)
      .join(' ')
    : displayInvocation
  return (
    <code
      className={cn(
        UI_INLINE_CHIP_GROUP_CLASSNAME,
        'min-w-0 overflow-hidden font-mono text-[9px]',
        surface === 'action' ? 'max-h-11 basis-full' : '',
        active ? UI_THEME_TOKENS.text.secondary : UI_THEME_TOKENS.text.tertiary,
      )}
      title={invocation || 'Waiting for the upstream invocation catalog'}
      data-kg-animation-invocation-chips={surface}
      data-kg-animation-invocation-chip-renderer="shared-markdown-sigil"
    >
      {renderMarkdownSigilInlineText(surface === 'action' ? compactInvocation : displayInvocation, {
        renderKeywordChip: ({ value, className }) => renderAgenticOsInvocationKeywordChip({ value, className, sourceLink: false }),
      })}
    </code>
  )
}

function AnimationPresetCard({
  collapsed,
  compatible,
  disabled,
  invocation,
  onApply,
  onToggle,
  preset,
}: {
  collapsed: boolean
  compatible: boolean
  disabled: boolean
  invocation: string
  onApply: () => void
  onToggle: (collapsed: boolean) => void
  preset: XrAnimationPreset
}) {
  const Icon = PRESET_ICON_BY_ID[preset.id]
  const detailsId = `xr-animation-preset-${preset.id}`
  const active = compatible && !disabled
  return (
    <article
      className={floatingPanelCatalogThreeRowClassName()}
      data-kg-animation-card={preset.id}
      data-kg-animation-card-layout="media-3-rows"
      data-kg-animation-card-kind={preset.kind}
    >
      <span className={floatingPanelCatalogThreeRowThumbnailFrameClassName('items-center justify-center')} role="img" aria-label={`${preset.label} procedural animation preview`}>
        <Icon className="size-8" strokeWidth={1.45} aria-hidden />
      </span>
      <section className="grid min-w-0 grid-rows-[auto_auto_auto] gap-1">
        <header className="flex min-w-0 items-center justify-between gap-2" data-kg-animation-card-row="title">
          <h3 className="truncate text-xs font-semibold">{preset.label}</h3>
          <button
            type="button"
            className="App-toolbar__btn grid size-6 shrink-0 place-items-center"
            title={collapsed ? `Expand ${preset.label}` : `Collapse ${preset.label}`}
            aria-label={collapsed ? `Expand ${preset.label}` : `Collapse ${preset.label}`}
            aria-expanded={!collapsed}
            aria-controls={detailsId}
            onClick={() => onToggle(!collapsed)}
            data-kg-animation-card-toggle={preset.id}
          >
            <ChevronDown className={cn('size-3.5 transition-transform', collapsed ? '' : 'rotate-180')} aria-hidden />
          </button>
        </header>
        <section className="grid min-w-0 gap-0.5" data-kg-animation-card-row="meta">
          <p className={cn('m-0 line-clamp-2 text-[11px]', UI_THEME_TOKENS.text.secondary)}>{preset.description}</p>
          <p className={cn('m-0 truncate text-[10px] uppercase tracking-wide', UI_THEME_TOKENS.text.tertiary)}>{preset.kind.replace('-', ' ')} · {preset.cycleSeconds}s · {preset.loop ? 'loop' : 'one shot'}</p>
        </section>
        <footer className="flex min-w-0 flex-wrap items-center gap-1" data-kg-animation-card-row="action">
          <button type="button" className="App-toolbar__btn shrink-0" disabled={disabled || !compatible} onClick={onApply} data-kg-animation-card-apply={preset.id}>Apply</button>
          <AnimationInvocationChips invocation={invocation} surface="action" />
        </footer>
      </section>
      <section
        id={detailsId}
        className={cn('col-span-2 grid gap-1 border-t pt-2 text-[10px]', UI_THEME_TOKENS.panel.border, collapsed ? 'hidden' : '')}
        data-kg-animation-card-details={preset.id}
      >
        <p className={UI_THEME_TOKENS.text.secondary}>Compatible: {preset.compatibleAssetIds.length ? preset.compatibleAssetIds.join(', ') : preset.compatibleCategories.join(', ') || 'graph cast'}</p>
        <p className={UI_THEME_TOKENS.text.tertiary}>Deterministic procedural pose/path · native AgenticGraph runtime · no external animation asset.</p>
        {!compatible ? <p className="text-amber-700 dark:text-amber-300">Choose a compatible cast target to apply this preset.</p> : null}
        <AnimationInvocationChips active={active} invocation={invocation} surface="details" />
      </section>
    </article>
  )
}

function PresetGroup({
  collapsedKeys,
  disabled,
  onApply,
  onToggle,
  presets,
  runtime,
  selectedActorId,
}: {
  collapsedKeys: ReadonlySet<string>
  disabled: boolean
  onApply: (preset: XrAnimationPreset) => void
  onToggle: (id: string, collapsed: boolean) => void
  presets: readonly XrAnimationPreset[]
  runtime: ReturnType<typeof readXrMotionReferenceRuntime>
  selectedActorId: string
}) {
  const selectedSubject = runtime.plan.subjects.find(subject => subject.id === selectedActorId)
  return (
    <section className="grid gap-2">
      {presets.map(preset => (
        <AnimationPresetCard
          key={preset.id}
          preset={preset}
          collapsed={collapsedKeys.has(preset.id)}
          disabled={disabled}
          compatible={xrAnimationPresetCompatible({ preset, assetId: selectedSubject?.assetId, category: selectedSubject?.category, graphActor: Boolean(selectedActorId && !selectedSubject) })}
          invocation={buildXrAnimationInvocation(preset.id)}
          onApply={() => onApply(preset)}
          onToggle={collapsed => onToggle(preset.id, collapsed)}
        />
      ))}
    </section>
  )
}

export function XrAnimationFloatingPanelView() {
  const sourceFilesBootstrapReady = useSourceFilesBootstrapReady()
  const grammarCatalog = useAgenticOsRemoteGrammarCatalog({ sigils: XR_ANIMATION_GRAMMAR_SIGILS })
  const { graphData, markdownDocumentName, markdownDocumentText, pushUiToast, selectedNodeId, timelinePlaying } = useGraphStore(useShallow(state => ({
    graphData: state.graphData,
    markdownDocumentName: state.markdownDocumentName,
    markdownDocumentText: state.markdownDocumentText,
    pushUiToast: state.pushUiToast,
    selectedNodeId: state.selectedNodeId,
    timelinePlaying: state.timelineTransportPlaying,
  })))
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const selectedActorId = readBoundXrSelectedActorId()
  const animationInspection = inspectLocalAnimation()
  const search = useFloatingPanelCatalogSearch()
  const sceneReady = resolveXrSceneDocumentReady({
    sourceFilesBootstrapReady,
    graphData,
    markdownDocumentName,
    markdownDocumentText,
  })
  const visiblePresets = React.useMemo(() => XR_ANIMATION_PRESETS.filter(preset => matchesFloatingPanelCatalogSearch(search.normalizedSearchQuery, [preset.id, preset.label, preset.kind, preset.description, ...preset.keywords])), [search.normalizedSearchQuery])
  const visibleKeys = React.useMemo(() => visiblePresets.map(preset => preset.id), [visiblePresets])
  const { allCollapsed, collapseAll, collapsedKeys, expandAll, setCollapsed } = useCollapsibleSectionGroup(visibleKeys)
  const visibleCharacter = visiblePresets.filter(preset => preset.kind === 'character-motion')
  const visiblePaths = visiblePresets.filter(preset => preset.kind === 'action-path')
  const selectedTrack = runtime.plan.cast.find(track => track.actorId === selectedActorId)
  const nativeInvocationReady = Boolean(animationInspection.catalog.canonical && animationInspection.invocationGrammar)
  const sourceMetadataReady = grammarCatalog.hydration.status === 'fresh'
    && XR_ANIMATION_REQUIRED_METADATA_TOKENS.every(required => grammarCatalog.entries.some(entry => entry.token === required.token && entry.kind === required.kind))
  const sourceMetadataLoading = grammarCatalog.hydration.status === 'idle' || grammarCatalog.hydration.status === 'loading'

  const toastResult = React.useCallback((result: ReturnType<typeof controlLocalAnimation>) => {
    pushUiToast({ id: result.ok ? 'xr:animation:updated' : 'xr:animation:error', kind: result.ok ? 'success' : sceneReady ? 'error' : 'warning', message: result.message })
    return result
  }, [pushUiToast, sceneReady])

  const applyPreset = React.useCallback((preset: XrAnimationPreset) => {
    toastResult(controlLocalAnimation({ operation: 'apply', trackKind: preset.kind, presetId: preset.id, targetId: 'selected-actor' }))
  }, [toastResult])

  const clearSelectedAnimation = React.useCallback(() => {
    if (!selectedTrack?.animation) return
    toastResult(controlLocalAnimation({ operation: 'clear', trackKind: selectedTrack.animation.kind, targetId: selectedTrack.actorId }))
  }, [selectedTrack, toastResult])

  const exportPackage = React.useCallback(() => {
    const result = toastResult(controlLocalAnimation({ operation: 'export' }))
    if (!result.ok || !result.package) return
    downloadBlob(xrMotionReferencePackageBlob(result.package), xrMotionReferencePackageFilename(result.package))
  }, [toastResult])

  const panelDisabled = !sceneReady || !selectedActorId
  return (
    <section
      className={floatingPanelCatalogSurfaceClassName()}
      aria-label="Animation"
      data-kg-animation-floating-panel="1"
      data-kg-animation-mcp="agenticgraph.control_local_animation"
      data-kg-animation-catalog="native-ready"
      data-kg-animation-metadata-status={grammarCatalog.hydration.status}
      data-kg-animation-metadata-version={String(grammarCatalog.version)}
    >
      <FloatingPanelCatalogHeader
        title="Animation"
        subtitle="Shared cast and camera choreography, playback, and export"
        actionsLabel="Animation actions"
        dataAttributes={{ 'data-kg-animation-header': '1' }}
        actions={(
          <>
            <button type="button" className="App-toolbar__btn" disabled={!sceneReady} onClick={() => toastResult(controlLocalAnimation({ operation: timelinePlaying ? 'pause' : 'play' }))} data-kg-animation-playback={timelinePlaying ? 'pause' : 'play'}>{timelinePlaying ? 'Pause' : 'Play'}</button>
            <button type="button" className="App-toolbar__btn" disabled={!sceneReady || !selectedTrack?.animation} onClick={clearSelectedAnimation} data-kg-animation-clear="selected-actor">Clear</button>
            <button type="button" className="App-toolbar__btn" disabled={!sceneReady} onClick={exportPackage} data-kg-animation-export="motion-reference">Export</button>
            <ExpandCollapseAllButton allCollapsed={allCollapsed} onExpandAll={expandAll} onCollapseAll={collapseAll} titleExpand="Expand All animation cards" titleCollapse="Collapse All animation cards" />
          </>
        )}
        searchControl={<FloatingPanelCatalogSearchControl id="xr-animation-search" buttonLabel="Search animation presets" panelLabel="Animation preset search" placeholder="Search motions and paths" state={search} />}
      />
      {!sceneReady || !nativeInvocationReady || !sourceMetadataReady ? <section className={cn('mb-2 grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} data-kg-animation-runtime-status="shared-xr">
        {!sceneReady ? <p className="rounded bg-amber-100 px-2 py-1 text-[10px] text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">Open or create a graph document to persist animation.</p> : null}
        {!nativeInvocationReady ? <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Native Animation invocation runtime unavailable.</p> : null}
        {!sourceMetadataReady ? (
          <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>
            {sourceMetadataLoading
              ? `ACOS Animation invocation metadata is loading.${nativeInvocationReady ? ' Native Animation controls remain ready.' : ''}`
              : `ACOS Animation invocation metadata is unavailable.${nativeInvocationReady ? ' Native Animation controls remain ready.' : ''}`}
          </p>
        ) : null}
      </section> : null}
      <section className={floatingPanelCatalogBodyClassName('grid content-start gap-3')}>
        <XrChoreographyInspector
          cameraInvocation={animationInspection.invocationGrammar?.configureCameraMark || animationInspection.webMcpTools.control}
          castInvocation={animationInspection.invocationGrammar?.configureCastMark || animationInspection.webMcpTools.control}
          controlTool={animationInspection.webMcpTools.control}
          invocationReady={nativeInvocationReady}
          runtime={runtime}
          selectedActorId={selectedActorId}
        />
        {visibleCharacter.length ? <section className="grid gap-2" aria-label="Character motions" data-kg-animation-group="character-motion"><header className="flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase">Character motions</h2><output className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>{visibleCharacter.length}</output></header><PresetGroup collapsedKeys={collapsedKeys} disabled={panelDisabled} onApply={applyPreset} onToggle={setCollapsed} presets={visibleCharacter} runtime={runtime} selectedActorId={selectedActorId} /></section> : null}
        {visiblePaths.length ? <section className="grid gap-2" aria-label="Action paths" data-kg-animation-group="action-path"><header className="flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase">Action paths</h2><output className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>{visiblePaths.length}</output></header><PresetGroup collapsedKeys={collapsedKeys} disabled={panelDisabled} onApply={applyPreset} onToggle={setCollapsed} presets={visiblePaths} runtime={runtime} selectedActorId={selectedActorId} /></section> : null}
        {!visiblePresets.length ? <p className={cn('p-3 text-xs', UI_THEME_TOKENS.text.tertiary)}>No animation presets match this search.</p> : null}
        <FlightSimTrainingSurfaceProjection surface="animation" />
      </section>
    </section>
  )
}

export default XrAnimationFloatingPanelView
