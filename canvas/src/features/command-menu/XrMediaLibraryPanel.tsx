import React from 'react'
import { XrSceneAppearanceControls } from '@/features/three/XrSceneAppearanceControls'
import { Building2, Hand, Trash2, TreePine, UsersRound } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useSourceFilesBootstrapReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
  XR_MOTION_REFERENCE_STAGE_PRESETS,
} from '@/features/three/xrMotionReferenceModel'
import {
  XR_SCENE_LIBRARY_DEFAULT_ASSET_ID,
  XR_SCENE_LIBRARY_ASSETS,
  XR_SCENE_LIBRARY_CATEGORY_LABELS,
  type XrSceneLibraryCategory,
} from '@/features/three/xrSceneLibrary'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { motionControlPoseToAnimationPose } from '@/features/three/motionControlPose'
import { readMotionControlSnapshot, subscribeMotionControl } from '@/features/three/motionControlRuntime'
import { openMotionControlSurface } from '@/features/three/motionControlSurfaceRuntime'
import { controlXrSharedAssetControls } from '@/features/three/xrSharedAssetControlRuntime'
import { resolveMotionControlSubjectPose } from '@/features/three/useMotionControlAnimationPose'
import {
  buildXrPlaceInvocation,
  buildXrStageInvocation,
  buildXrTransformInvocation,
} from '@/features/three/xrSceneMcpContract.mjs'
import { controlLocalXrScene, type XrSceneControlInput, type XrSceneTransition } from '@/features/three/xrSceneMcpRuntime'
import { SpatialAssetToolsPanel } from '@/features/three/SpatialAssetToolsPanel'
import { XrSimulationWorkbench } from './XrSimulationWorkbench'
import {
  readXrSimulationWorkbenchOpenRevision,
  subscribeXrSimulationWorkbenchOpenRequest,
} from './xrSimulationWorkbenchOpenRequest'
import {
  reconcileNextSubjectLabelAfterDrop,
  reconcileXrTransformNumberDraft,
} from './xrMediaAuthoringDrafts'
import {
  XR_SCENE_MEDIA_DROP_COMMITTED_EVENT,
  buildXrStageMediaDragPayload,
  type XrSceneMediaDropCommittedDetail,
} from '@/features/three/xrSceneMediaDrag'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import ExpandCollapseAllButton from '@/features/panels/ui/ExpandCollapseAllButton'
import { useCollapsibleSectionGroup } from '@/features/panels/ui/useCollapsibleSectionGroup'
import { XrCatalogThumb } from './XrMediaCatalogThumbs'
import {
  XR_MEDIA_CATEGORY_ICONS,
  XrAssetRow,
  XrInvocationButton,
  XrLibraryCard,
} from './XrMediaLibraryCards'
export { XrInvocationButton }
import { XrEnvironmentGeoButton } from './XrEnvironmentGeoButton'
import { XrMediaLibrarySummary } from './XrMediaLibraryHeader'
import { isXrMediaInvocationMetadataReady } from './xrMediaInvocationMetadata'
import { buildXrMediaLibraryProjection } from './xrMediaLibrarySearch'
import { buildXrMediaInvocationControlInput } from './xrMediaInvocationRuntime'
import { resolveXrSceneDocumentReady } from '@/features/three/xrSceneDocumentReadiness'
type XrSceneLibraryFilter = 'all' | XrSceneLibraryCategory

const XR_LIBRARY_SECTION_KEYS = ['environments', 'subjects-props', 'simulation'] as const
const XR_SCENE_GRAMMAR_SIGILS = ['/', '#', '@'] as const

export function XrMediaLibraryPanel({ searchText }: { searchText: string }) {
  const sourceFilesBootstrapReady = useSourceFilesBootstrapReady()
  const grammarCatalog = useAgenticOsRemoteGrammarCatalog({ sigils: XR_SCENE_GRAMMAR_SIGILS })
  const {
    graphData,
    markdownDocumentName,
    markdownDocumentText,
    pushUiToast,
  } = useGraphStore(useShallow(state => ({
    graphData: state.graphData,
    markdownDocumentName: state.markdownDocumentName,
    markdownDocumentText: state.markdownDocumentText,
    pushUiToast: state.pushUiToast,
  })))
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const motionControl = React.useSyncExternalStore(subscribeMotionControl, readMotionControlSnapshot, readMotionControlSnapshot)
  const simulationWorkbenchOpenRevision = React.useSyncExternalStore(
    subscribeXrSimulationWorkbenchOpenRequest,
    readXrSimulationWorkbenchOpenRevision,
    readXrSimulationWorkbenchOpenRevision,
  )
  const [subjectView, setSubjectView] = React.useState<'catalog' | 'scene'>('scene')
  const [categoryFilter, setCategoryFilter] = React.useState<XrSceneLibraryFilter>('all')
  const [nextLabel, setNextLabel] = React.useState('')
  const [selectedAssetId, setSelectedAssetId] = React.useState<string>(XR_SCENE_LIBRARY_DEFAULT_ASSET_ID)
  const [assetTransitions, setAssetTransitions] = React.useState<Record<string, XrSceneTransition>>({})
  const [subjectLabelDrafts, setSubjectLabelDrafts] = React.useState<Record<string, string>>({})
  const {
    allCollapsed: allLibrarySectionsCollapsed,
    collapseAll: collapseAllLibrarySections,
    collapsedKeys: collapsedLibrarySectionKeys,
    expandAll: expandAllLibrarySections,
    setCollapsed: setLibrarySectionCollapsed,
  } = useCollapsibleSectionGroup(XR_LIBRARY_SECTION_KEYS)
  React.useEffect(() => {
    if (simulationWorkbenchOpenRevision > 0) setLibrarySectionCollapsed('simulation', false)
  }, [setLibrarySectionCollapsed, simulationWorkbenchOpenRevision])
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const onCommittedDrop = (event: Event) => {
      const detail = (event as CustomEvent<XrSceneMediaDropCommittedDetail>).detail
      if (!detail?.subjectLabel) return
      setNextLabel(current => reconcileNextSubjectLabelAfterDrop(current, detail.subjectLabel))
    }
    window.addEventListener(XR_SCENE_MEDIA_DROP_COMMITTED_EVENT, onCommittedDrop)
    return () => window.removeEventListener(XR_SCENE_MEDIA_DROP_COMMITTED_EVENT, onCommittedDrop)
  }, [])
  const sceneReady = resolveXrSceneDocumentReady({
    sourceFilesBootstrapReady,
    graphData,
    markdownDocumentName,
    markdownDocumentText,
  })
  const motionControlPose = React.useMemo(
    () => motionControlPoseToAnimationPose(motionControl.pose),
    [motionControl.pose],
  )
  const sourceMetadataReady = isXrMediaInvocationMetadataReady(grammarCatalog)
  const runControl = React.useCallback((input: XrSceneControlInput) => {
    const result = controlLocalXrScene(input)
    pushUiToast({
      id: result.ok ? 'media:xr-library:updated' : 'media:xr-library:error',
      kind: result.ok ? 'success' : sceneReady ? 'error' : 'warning',
      message: result.message,
    })
    return result
  }, [pushUiToast, sceneReady])

  const runInvocation = React.useCallback((invocation: string) => {
    return runControl(buildXrMediaInvocationControlInput(invocation))
  }, [runControl])

  const placeAsset = React.useCallback((invocation: string) => {
    const result = runInvocation(invocation)
    if (result.ok) setNextLabel('')
  }, [runInvocation])

  const commitSubjectLabel = React.useCallback((subjectId: string) => {
    const nextValue = String(subjectLabelDrafts[subjectId] || '').trim()
    if (!nextValue) return
    runControl({ action: 'label', subjectId, label: nextValue })
  }, [runControl, subjectLabelDrafts])

  const removeSubject = React.useCallback((subjectId: string) => {
    runControl({ action: 'remove', subjectId })
  }, [runControl])

  const setSubjectTransition = React.useCallback((subjectId: string, transition: XrSceneTransition) => {
    runControl({ action: 'transition', subjectId, transition })
  }, [runControl])

  const setSubjectMotionControlTarget = React.useCallback((subjectId: string, subjectLabel: string) => {
    const result = controlXrSharedAssetControls({ operation: 'select-target', targetId: subjectId })
    if (result.ok) openMotionControlSurface('motion-control')
    pushUiToast({
      id: 'media:xr-library:motion-control-target',
      kind: result.ok ? 'success' : 'error', message: result.ok ? `Motion Control target set to ${subjectLabel}.` : result.message,
    })
  }, [pushUiToast])

  const setSubjectTransform = React.useCallback((subjectId: string, transform: Pick<XrSceneControlInput, 'assetId' | 'position' | 'rotationYDegrees' | 'scale' | 'color'>) => {
    return runControl({ action: 'transform', subjectId, ...transform }).ok
  }, [runControl])

  const selectedSubjectId = runtime.plan.subjects.some(subject => subject.id === runtime.selectedShotTargetId)
    ? runtime.selectedShotTargetId
    : ''

  const catalog = React.useMemo(() => buildXrMediaLibraryProjection({ categoryFilter, searchText, selectedAssetId }), [categoryFilter, searchText, selectedAssetId])
  const { featuredAssets, selectedAsset, visibleAssets, visibleEnvironments } = catalog
  const visibleSubjects = runtime.plan.subjects.filter(subject => (categoryFilter === 'all' || subject.category === categoryFilter)
    && `${subject.label} ${subject.assetId}`.toLowerCase().includes(searchText.trim().toLowerCase()))

  return (
    <section
      className="grid min-w-0 gap-3"
      aria-label="3D for XR library"
      data-kg-media-xr-library="1"
      data-kg-media-xr-assets-mcp="agentic-graph.control_local_xr_scene"
      data-kg-media-xr-scene-ready={sceneReady ? '1' : '0'}
      data-kg-media-xr-metadata-status={grammarCatalog.hydration.status}
      data-kg-media-xr-metadata-version={String(grammarCatalog.version)}
    >
      <header className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}>
        <section className="flex items-start gap-2">
          <XrMediaLibrarySummary metadataReady={sourceMetadataReady} metadataStatus={grammarCatalog.hydration.status} />
          <section className="flex shrink-0 items-center gap-1">
            <output className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>{runtime.plan.subjects.length} placed</output>
            <ExpandCollapseAllButton
              allCollapsed={allLibrarySectionsCollapsed}
              onExpandAll={expandAllLibrarySections}
              onCollapseAll={collapseAllLibrarySections}
              titleExpand="Expand All XR library sections"
              titleCollapse="Collapse All XR library sections"
            />
          </section>
        </section>
        {!sceneReady ? <p className="rounded bg-amber-100 px-2 py-1 text-[10px] text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">Open or create a graph document to place and persist XR scene media.</p> : null}
        <label className="grid gap-1 text-[10px]">
          <span className={UI_THEME_TOKENS.text.tertiary}>Label next subject</span>
          <PanelTextInput value={nextLabel} maxLength={80} placeholder="Optional subject label, e.g. THIEF" onChange={event => setNextLabel(event.target.value)} data-kg-media-xr-next-label="1" />
        </label>
        <section className="grid grid-cols-2 gap-2" aria-label="XR terrain and featured asset controls">
          <label className="grid min-w-0 gap-1 text-[10px]">
            <span className={UI_THEME_TOKENS.text.tertiary}>Terrain / Environment</span>
            <PanelSelect
              value={runtime.plan.stageId}
              onChange={event => runInvocation(buildXrStageInvocation(event.target.value))}
              aria-label="Change XR terrain or environment"
              data-kg-media-xr-terrain-selector="1"
              data-kg-media-xr-default-terrain={XR_MOTION_REFERENCE_DEFAULT_STAGE_ID}
            >
              {XR_MOTION_REFERENCE_STAGE_PRESETS.map(stage => (
                <option key={stage.id} value={stage.id}>{stage.label}{stage.id === XR_MOTION_REFERENCE_DEFAULT_STAGE_ID ? ' (Default)' : ''}</option>
              ))}
            </PanelSelect>
          </label>
          <label className="grid min-w-0 gap-1 text-[10px]">
            <span className={UI_THEME_TOKENS.text.tertiary}>Add 3D Object / Asset</span>
            <PanelSelect
              value={selectedAsset?.id || XR_SCENE_LIBRARY_DEFAULT_ASSET_ID}
              onChange={event => setSelectedAssetId(event.target.value)}
              aria-label="Select featured XR 3D object or asset"
              data-kg-media-xr-featured-asset-selector="1"
              data-kg-media-xr-default-asset={XR_SCENE_LIBRARY_DEFAULT_ASSET_ID}
            >
              {featuredAssets.map(asset => (
                <option key={asset.id} value={asset.id}>{asset.label}{asset.id === XR_SCENE_LIBRARY_DEFAULT_ASSET_ID ? ' (Default)' : ''}</option>
              ))}
            </PanelSelect>
          </label>
        </section>
        {selectedAsset ? (
          <section className="flex min-w-0 justify-end">
            <XrInvocationButton
              invocation={buildXrPlaceInvocation(
                selectedAsset.id,
                selectedAsset.mobile ? assetTransitions[selectedAsset.id] || 'linear' : 'hold',
                nextLabel,
              )}
              disabled={!sceneReady}
              onInvoke={placeAsset}
            />
          </section>
        ) : null}
      </header>
      <XrSceneAppearanceControls disabled={!sceneReady} />

      <CollapsibleSection
        title={<span className="flex min-w-0 items-center justify-between gap-2"><span className="truncate text-[11px] font-semibold uppercase">Terrain / Environment Kits</span><output className={cn('shrink-0 text-[10px]', UI_THEME_TOKENS.text.tertiary)}>{visibleEnvironments.length}</output></span>}
        collapsed={collapsedLibrarySectionKeys.has('environments')}
        onToggle={collapsed => setLibrarySectionCollapsed('environments', collapsed)}
        defaultCollapsed={false}
        flushTop
        headerClassName="px-0"
        className="mt-1 border-t pt-1"
        id="xr-media-environment-kits"
      >
        <section className="grid gap-2" aria-label="XR environment kits" data-kg-media-xr-environments="1">
          <section className="grid gap-1">
            {visibleEnvironments.map(stage => {
              const active = runtime.plan.stageId === stage.id
              return (
                <XrLibraryCard
                  key={stage.id}
                  Icon={stage.environmentKind === 'terrain' || stage.id === 'aerial-sky' ? TreePine : Building2}
                  color={active ? '#38bdf8' : '#94a3b8'}
                  label={stage.label}
                  description={stage.description}
                  metadata={`${stage.environmentKind}${stage.id === XR_MOTION_REFERENCE_DEFAULT_STAGE_ID ? ' · default' : ''} · ${stage.sizeMeters.join(' × ')} m · ${stage.id === 'tropical-playground' ? 'procedural island' : stage.id === 'singapore' ? 'procedural city' : 'grey-box stage'}`}
                  dragPayload={buildXrStageMediaDragPayload(stage)}
                  active={active}
                  dataAttributes={{ 'data-kg-media-xr-environment': stage.id }}
                  footer={<>
                    <XrEnvironmentGeoButton stageId={stage.id} stageLabel={stage.label} disabled={!sceneReady} onSelect={stageId => runInvocation(buildXrStageInvocation(stageId))} />
                    <XrInvocationButton invocation={buildXrStageInvocation(stage.id)} disabled={!sceneReady} onInvoke={runInvocation} />
                  </>}
                />
              )
            })}
          </section>
        </section>
      </CollapsibleSection>

      <CollapsibleSection
        title={<span className="flex min-w-0 items-center justify-between gap-2"><span className="truncate text-[11px] font-semibold uppercase">Subjects &amp; Props</span><output className={cn('shrink-0 text-[10px]', UI_THEME_TOKENS.text.tertiary)}>{subjectView === 'scene' ? visibleSubjects.length : visibleAssets.length}</output></span>}
        collapsed={collapsedLibrarySectionKeys.has('subjects-props')}
        onToggle={collapsed => setLibrarySectionCollapsed('subjects-props', collapsed)}
        defaultCollapsed={false}
        headerClassName="px-0"
        className="mt-1 border-t pt-1"
        id="xr-media-subjects-props"
      >
        <section className="grid gap-2" aria-label="XR subject library" data-kg-media-xr-subject-library="1">
          <nav className="flex gap-2" aria-label="Subjects and props view">
            {(['scene', 'catalog'] as const).map(view => <button key={view} type="button" className="App-toolbar__btn" aria-pressed={subjectView === view} onClick={() => setSubjectView(view)}>{view === 'scene' ? `In scene (${runtime.plan.subjects.length})` : 'Add from library'}</button>)}
          </nav>
          <header className="grid gap-2">
            <nav className="flex max-w-full gap-1 overflow-x-auto pb-1" aria-label="XR library categories">
              {(['all', 'people', 'animals', 'vehicles', 'furniture', 'props'] as const).map(category => {
                const Icon = category === 'all' ? UsersRound : XR_MEDIA_CATEGORY_ICONS[category]
                const label = category === 'all' ? 'All' : XR_SCENE_LIBRARY_CATEGORY_LABELS[category]
                return <button key={category} type="button" className={cn('App-toolbar__btn inline-flex shrink-0 items-center gap-1', categoryFilter === category ? UI_THEME_TOKENS.button.activeBg : '')} aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)} data-kg-media-xr-category={category}><Icon className="size-3" aria-hidden />{label}</button>
              })}
            </nav>
          </header>
          {subjectView === 'catalog' ? <section className="grid gap-1">{visibleAssets.map(asset => <XrAssetRow key={asset.id} asset={asset} disabled={!sceneReady} selectedSubjectId={selectedSubjectId} subjectLabel={nextLabel} transition={assetTransitions[asset.id] || 'linear'} onTransitionChange={transition => setAssetTransitions(current => ({ ...current, [asset.id]: transition }))} onPlace={placeAsset} onSwap={runInvocation} />)}</section> : null}
          {subjectView === 'scene' ? (
            <section className="grid gap-2 border-t pt-2" aria-label="Placed XR subjects" data-kg-media-xr-placed-subjects="subjects-props">
              {!visibleSubjects.length ? <p className="text-xs opacity-70">No matching subjects in this scene. Add from the library or change the filter.</p> : null}
              {visibleSubjects.map(subject => {
                const subjectAsset = XR_SCENE_LIBRARY_ASSETS.find(asset => asset.id === subject.assetId)
                const motionTargetSelected = runtime.selectedShotTargetId === subject.id
                const liveGesturePose = resolveMotionControlSubjectPose(subject, runtime.selectedShotTargetId, motionControlPose)
                const motionGestureStatus = liveGesturePose
                  ? 'live-gesture'
                  : motionTargetSelected
                    ? motionControl.cameraActive ? 'waiting-for-pose' : 'selected'
                    : 'available'
                return (
                  <article
                    key={subject.id}
                    className={cn('grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
                    data-kg-media-xr-placed-subject={subject.id}
                    data-kg-media-xr-motion-control-target={motionTargetSelected ? 'selected' : 'available'}
                    data-kg-media-xr-motion-control-gesture={motionGestureStatus}
                    data-kg-media-xr-motion-control-asset-shape={subjectAsset?.shape || 'box'}
                  >
                    <XrCatalogThumb Icon={XR_MEDIA_CATEGORY_ICONS[subject.category]} color={subject.color} assetId={subject.assetId} label={subject.label} />
                    <label className="grid min-w-0 gap-0.5 text-[10px]"><span className={UI_THEME_TOKENS.text.tertiary}>{subject.assetId}</span><PanelTextInput value={subjectLabelDrafts[subject.id] ?? subject.label} maxLength={80} onChange={event => setSubjectLabelDrafts(current => ({ ...current, [subject.id]: event.target.value }))} onBlur={() => commitSubjectLabel(subject.id)} aria-label={`Label ${subject.label}`} data-kg-media-xr-subject-label={subject.id} /></label>
                    {runtime.plan.cast.some(track => track.actorId === subject.id) ? <PanelSelect className="w-20 text-[10px]" aria-label={`Path interpolation for ${subject.label}`} value={runtime.plan.cast.find(track => track.actorId === subject.id)?.marks[0]?.transition === 'hold' ? 'hold' : 'linear'} onChange={event => setSubjectTransition(subject.id, event.target.value as XrSceneTransition)} data-kg-media-xr-subject-transition={subject.id}><option value="linear">Travel</option><option value="hold">Hold</option></PanelSelect> : <span className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>Static</span>}
                    <section className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className={cn('App-toolbar__btn', motionTargetSelected ? UI_THEME_TOKENS.button.activeBg : '')}
                        aria-label={`Use Motion Control on ${subject.label}`}
                        aria-pressed={motionTargetSelected}
                        title={`Use Motion Control on ${subject.label}`}
                        onClick={() => setSubjectMotionControlTarget(subject.id, subject.label)}
                        data-kg-media-xr-motion-control-target-button={subject.id}
                        data-kg-media-xr-motion-control-live={liveGesturePose ? '1' : '0'}
                      >
                        <Hand className="size-3.5" aria-hidden />
                      </button>
                      <button type="button" className="App-toolbar__btn" aria-label={`Remove ${subject.label}`} title={`Remove ${subject.label}`} onClick={() => removeSubject(subject.id)} data-kg-media-xr-remove-subject={subject.id}><Trash2 className="size-3.5" aria-hidden /></button>
                    </section>
                    <section className={cn('col-span-4 grid gap-2 border-t pt-2', UI_THEME_TOKENS.panel.border)} aria-label={`${subject.label} 3D object transform`} data-kg-media-xr-subject-transform={subject.id}>
                      <header className="flex min-w-0 items-center justify-between gap-2">
                        <span className={cn('text-[9px] font-semibold uppercase', UI_THEME_TOKENS.text.tertiary)}>3D Object / Asset Transform</span>
                        <XrInvocationButton
                          invocation={buildXrTransformInvocation(subject.id, subject)}
                          disabled={!sceneReady}
                          onInvoke={runInvocation}
                        />
                      </header>
                      <label className="grid gap-1 text-[9px]">
                        <span className={UI_THEME_TOKENS.text.tertiary}>3D Object / Asset</span>
                        <PanelSelect
                          value={subject.assetId}
                          aria-label={`Change 3D object or asset for ${subject.label}`}
                          data-kg-media-xr-subject-asset={subject.id}
                          onChange={event => setSubjectTransform(subject.id, { assetId: event.target.value })}
                        >
                          {XR_SCENE_LIBRARY_ASSETS.map(asset => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
                        </PanelSelect>
                      </label>
                      <fieldset className="grid grid-cols-3 gap-1 border-0 p-0" data-kg-media-xr-subject-position={subject.id}>
                        <legend className={cn('col-span-3 text-[9px]', UI_THEME_TOKENS.text.tertiary)}>Position · meters</legend>
                        {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                          <label key={axis} className="grid gap-0.5 text-[9px]"><span className={UI_THEME_TOKENS.text.tertiary}>{axis}</span><PanelTextInput
                            key={`${subject.id}:${axis}:${subject.position[index]}`}
                            type="number"
                            min={index === 1 ? 0 : -50}
                            max={50}
                            step={0.1}
                            defaultValue={subject.position[index]}
                            aria-label={`${subject.label} ${axis} position`}
                            data-kg-media-xr-subject-position-axis={axis.toLowerCase()}
                            onBlur={event => {
                              const input = event.currentTarget
                              input.value = reconcileXrTransformNumberDraft({
                                draftValue: input.value,
                                persistedValue: subject.position[index],
                                minimum: Number(input.min),
                                maximum: Number(input.max),
                                commit: value => {
                                  const position = [...subject.position] as [number, number, number]
                                  position[index] = value
                                  return setSubjectTransform(subject.id, { position })
                                },
                              })
                            }}
                          /></label>
                        ))}
                      </fieldset>
                      <section className="grid grid-cols-3 gap-1">
                        <label className="grid gap-0.5 text-[9px]"><span className={UI_THEME_TOKENS.text.tertiary}>Rotation Y°</span><PanelTextInput
                          key={`${subject.id}:rotation:${subject.rotationYDegrees}`}
                          type="number"
                          min={-180}
                          max={180}
                          step={1}
                          defaultValue={subject.rotationYDegrees}
                          aria-label={`${subject.label} Y rotation degrees`}
                          data-kg-media-xr-subject-rotation={subject.id}
                          onBlur={event => {
                            const input = event.currentTarget
                            input.value = reconcileXrTransformNumberDraft({
                              draftValue: input.value,
                              persistedValue: subject.rotationYDegrees,
                              minimum: Number(input.min),
                              maximum: Number(input.max),
                              commit: value => setSubjectTransform(subject.id, { rotationYDegrees: value }),
                            })
                          }}
                        /></label>
                        <label className="grid gap-0.5 text-[9px]"><span className={UI_THEME_TOKENS.text.tertiary}>Scale</span><PanelTextInput
                          key={`${subject.id}:scale:${subject.scale}`}
                          type="number"
                          min={0.25}
                          max={4}
                          step={0.05}
                          defaultValue={subject.scale}
                          aria-label={`${subject.label} scale`}
                          data-kg-media-xr-subject-scale={subject.id}
                          onBlur={event => {
                            const input = event.currentTarget
                            input.value = reconcileXrTransformNumberDraft({
                              draftValue: input.value,
                              persistedValue: subject.scale,
                              minimum: Number(input.min),
                              maximum: Number(input.max),
                              commit: value => setSubjectTransform(subject.id, { scale: value }),
                            })
                          }}
                        /></label>
                        <label className="grid gap-0.5 text-[9px]"><span className={UI_THEME_TOKENS.text.tertiary}>Color</span><PanelTextInput
                          type="color"
                          value={subject.color}
                          aria-label={`${subject.label} color`}
                          data-kg-media-xr-subject-color={subject.id}
                          onChange={event => setSubjectTransform(subject.id, { color: event.target.value })}
                        /></label>
                      </section>
                    </section>
                  </article>
                )
              })}
            </section>
          ) : null}
        </section>
      </CollapsibleSection>

      <CollapsibleSection
        title={<span className="flex min-w-0 items-center justify-between gap-2"><span className="truncate text-[11px] font-semibold uppercase">Simulation</span><output className={cn('shrink-0 text-[10px]', UI_THEME_TOKENS.text.tertiary)}>{runtime.plan.subjects.length} subjects</output></span>}
        collapsed={collapsedLibrarySectionKeys.has('simulation')}
        onToggle={collapsed => setLibrarySectionCollapsed('simulation', collapsed)}
        defaultCollapsed={false}
        headerClassName="px-0"
        className="mt-1 border-t pt-1"
        id="xr-media-simulation"
      >
        <XrSimulationWorkbench sceneReady={sceneReady} runControl={runControl} />
      </CollapsibleSection>
      <SpatialAssetToolsPanel />
    </section>
  )
}
