import type { XrMotionReferenceSubject } from '@/features/three/xrMotionReferenceModel'
import type { XrSceneControlInput } from '@/features/three/xrSceneMcpRuntime'
import { buildXrMediaInvocationControlInput } from './xrMediaInvocationRuntime'
import { reconcileXrTransformNumberDraft } from './xrMediaAuthoringDrafts'
import { XrCatalogArtwork } from './XrMediaCatalogThumbs'
import React from 'react'
import { Armchair, Box, Car, PawPrint, UserRound, type LucideIcon } from 'lucide-react'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import type { MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import {
  XR_SCENE_LIBRARY_DEFAULT_ASSET_ID,
  XR_SCENE_LIBRARY_ASSETS,
  type XrSceneLibraryAsset,
  type XrSceneLibraryCategory,
} from '@/features/three/xrSceneLibrary'
import {
  buildXrPlaceInvocation,
  buildXrTransformInvocation,
} from '@/features/three/xrSceneMcpContract.mjs'
import type { XrSceneTransition } from '@/features/three/xrSceneMcpRuntime'
import { buildXrAssetMediaDragPayload } from '@/features/three/xrSceneMediaDrag'
import {
  continueMediaMouseDrag,
  continueMediaPointerDrag,
  finishMediaDrag,
  isMediaRowControlTarget,
  mediaListItemClassName,
  mediaListThumbnailFrameClassName,
  primeMediaMouseDrag,
  primeMediaPointerDrag,
  shouldHandleMediaRowPointer,
  shouldPrimeMediaRowDragPayload,
  startMediaDrag,
  startMediaMouseDrag,
  startMediaPointerDrag,
} from './mediaCatalogShared'

export const XR_MEDIA_CATEGORY_ICONS: Readonly<Record<XrSceneLibraryCategory, LucideIcon>> = {
  people: UserRound,
  animals: PawPrint,
  vehicles: Car,
  furniture: Armchair,
  props: Box,
}

export function XrInvocationButton({ invocation, disabled, onInvoke }: { invocation: string; disabled: boolean; onInvoke: (invocation: string) => void }) {
  return (
    <button
      type="button"
      className={cn('App-toolbar__btn', UI_INLINE_CHIP_GROUP_CLASSNAME, 'max-w-full overflow-hidden')}
      disabled={disabled}
      title={`Invoke ${invocation}`}
      aria-label={`Invoke ${invocation}`}
      onClick={() => onInvoke(invocation)}
      data-kg-media-xr-invocation={invocation}
      data-kg-media-xr-invocation-chip-renderer="shared-markdown-sigil"
    >
      {renderMarkdownSigilInlineText(invocation, {
        renderKeywordChip: ({ value, className }) => renderAgenticOsInvocationKeywordChip({ value, className, sourceLink: false }),
      })}
    </button>
  )
}

function XrMediaCatalogThumb({ Icon, color, label, assetId }: { Icon: LucideIcon; color: string; label: string; assetId?: string }) {
  return (
    <span
      className={mediaListThumbnailFrameClassName('items-center justify-center cursor-grab active:cursor-grabbing')}
      style={{ color }}
      role="img"
      aria-label={`${label} preview`}
      data-kg-media-xr-thumbnail="media-card"
    >
      <XrCatalogArtwork Icon={Icon} color={color} label={label} assetId={assetId} />
    </span>
  )
}

export function XrLibraryCard({
  Icon,
  color,
  label,
  description,
  metadata,
  footer,
  dragPayload,
  active = false,
  dataAttributes,
  onSelect,
}: {
  Icon: LucideIcon
  color: string
  label: string
  description: string
  metadata: string
  footer: React.ReactNode
  dragPayload?: MediaDragPayload
  onSelect?: () => void
  active?: boolean
  dataAttributes?: Record<string, string>
}) {
  return (
    <article
      draggable={Boolean(dragPayload)}
      className={cn(mediaListItemClassName(), active ? UI_THEME_TOKENS.button.activeBg : '')}
      title={dragPayload ? `Drag ${label} onto the Canvas` : `Select ${label} in Timeline`}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? event => { if (!isMediaRowControlTarget(event.target)) onSelect() } : undefined}
      onKeyDown={onSelect ? event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect() } } : undefined}
      aria-label={dragPayload ? `${label}. Drag onto the Canvas.` : `${label}. Select in Timeline.`}
      data-kg-media-draggable={dragPayload ? '1' : undefined}
      data-kg-media-drag-affordance="frame"
      data-kg-media-xr-draggable={dragPayload ? '1' : undefined}
      data-kg-media-list-row-layout="3-rows"
      data-kg-media-xr-card-layout="media-3-rows"
      onDragStart={event => { if (dragPayload) startMediaDrag(event, dragPayload) }}
      onDragEnd={finishMediaDrag}
      onPointerDownCapture={event => {
        if (!shouldPrimeMediaRowDragPayload(event)) return
        if (dragPayload) primeMediaPointerDrag(event, dragPayload)
      }}
      onPointerDown={event => {
        if (!shouldHandleMediaRowPointer(event)) return
        if (dragPayload) startMediaPointerDrag(event, dragPayload)
      }}
      onPointerMove={event => {
        if (isMediaRowControlTarget(event.target)) return
        if (dragPayload) continueMediaPointerDrag(event, dragPayload)
      }}
      onMouseDownCapture={event => {
        if (!shouldPrimeMediaRowDragPayload(event)) return
        if (dragPayload) primeMediaMouseDrag(event, dragPayload)
      }}
      onMouseDown={event => {
        if (isMediaRowControlTarget(event.target)) return
        if (dragPayload) startMediaMouseDrag(event, dragPayload)
      }}
      onMouseMove={event => {
        if (isMediaRowControlTarget(event.target)) return
        if (dragPayload) continueMediaMouseDrag(event, dragPayload)
      }}
      {...dataAttributes}
    >
      <XrMediaCatalogThumb Icon={Icon} color={color} label={label} assetId={dataAttributes?.['data-kg-media-xr-asset'] || dataAttributes?.['data-kg-media-xr-environment']} />
      <section className="grid min-w-0 grid-rows-[auto_auto_auto] gap-1" aria-label={`${label} XR media summary`}>
        <header className="flex min-w-0 items-center justify-between gap-2" data-kg-media-list-row-section="title">
          <h4 className="truncate text-xs font-semibold" title={label}>{label}</h4>
        </header>
        <section className="grid min-w-0 gap-0.5" data-kg-media-list-row-section="meta">
          <p className={cn('m-0 line-clamp-2 text-[11px]', UI_THEME_TOKENS.text.secondary)} title={description}>{description}</p>
          <p className={cn('m-0 truncate text-[10px] uppercase tracking-wide', UI_THEME_TOKENS.text.tertiary)} title={metadata}>{metadata}</p>
        </section>
        <footer className="flex min-w-0 items-center gap-1" data-kg-media-list-row-section="description">{footer}</footer>
      </section>
    </article>
  )
}

export function XrAssetRow({
  asset,
  disabled,
  selectedSubjectId,
  subjectLabel,
  transition,
  onTransitionChange,
  onPlace,
  onSwap,
}: {
  asset: XrSceneLibraryAsset
  disabled: boolean
  selectedSubjectId: string
  subjectLabel: string
  transition: XrSceneTransition
  onTransitionChange: (transition: XrSceneTransition) => void
  onPlace: (invocation: string) => void
  onSwap: (invocation: string) => void
}) {
  const Icon = XR_MEDIA_CATEGORY_ICONS[asset.category]
  const invocation = buildXrPlaceInvocation(asset.id, asset.mobile ? transition : 'hold', subjectLabel)
  const swapInvocation = selectedSubjectId
    ? buildXrTransformInvocation(selectedSubjectId, { assetId: asset.id })
    : ''
  return (
    <XrLibraryCard
      Icon={Icon}
      color={asset.defaultColor}
      label={asset.label}
      description={asset.description}
      metadata={`${asset.category} · ${asset.dimensionsMeters.join(' × ')} m · ${asset.mobile ? 'markable cast' : 'static reference'}${asset.id === XR_SCENE_LIBRARY_DEFAULT_ASSET_ID ? ' · default' : ''}`}
      dragPayload={buildXrAssetMediaDragPayload(asset, transition, subjectLabel)}
      dataAttributes={{
        'data-kg-media-xr-asset': asset.id,
        'data-kg-media-xr-asset-category': asset.category,
        'data-kg-media-xr-asset-default': asset.id === XR_SCENE_LIBRARY_DEFAULT_ASSET_ID ? '1' : '0',
      }}
      footer={(
        <>
          {asset.mobile ? (
            <PanelSelect
              className="w-20 shrink-0 text-[10px]"
              aria-label={`Path interpolation for ${asset.label}`}
              value={transition}
              onChange={event => onTransitionChange(event.target.value as XrSceneTransition)}
              data-kg-media-xr-asset-transition={asset.id}
            >
              <option value="linear">Travel</option>
              <option value="hold">Hold</option>
            </PanelSelect>
          ) : null}
          {selectedSubjectId ? (
            <span data-kg-media-xr-swap-asset={asset.id} data-kg-media-xr-swap-subject={selectedSubjectId}>
              <XrInvocationButton invocation={swapInvocation} disabled={disabled} onInvoke={onSwap} />
            </span>
          ) : null}
          <XrInvocationButton invocation={invocation} disabled={disabled} onInvoke={onPlace} />
        </>
      )}
    />
  )
}

export function XrSubjectTransformCard({ subject, sceneReady, runControl }: {
  subject: XrMotionReferenceSubject
  sceneReady: boolean
  runControl: (input: XrSceneControlInput) => { ok: boolean }
}) {
  const setSubjectTransform = (subjectId: string, transform: Pick<XrSceneControlInput, 'assetId' | 'position' | 'rotationYDegrees' | 'scale' | 'color'>) => {
    return runControl({ action: 'transform', subjectId, ...transform }).ok
  }
  const runInvocation = (invocation: string) => runControl(buildXrMediaInvocationControlInput(invocation))
  return (
  <section className={cn('grid gap-2 sm:grid-cols-3', UI_THEME_TOKENS.panel.border)} aria-label={`${subject.label} 3D object transform`} data-kg-media-xr-subject-transform={subject.id}>
    <header className="flex min-w-0 items-center justify-between gap-2 sm:col-span-3">
      <span className={cn('text-[9px] font-semibold uppercase', UI_THEME_TOKENS.text.tertiary)}>3D Object / Asset Transform</span>
      <details className="min-w-0 max-w-[50%]"><summary className="text-[10px] cursor-pointer">Command</summary><XrInvocationButton
        invocation={buildXrTransformInvocation(subject.id, subject)}
        disabled={!sceneReady}
        onInvoke={runInvocation}
      /></details>
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
  )
}
