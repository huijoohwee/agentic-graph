import { XrCatalogArtwork } from './XrMediaCatalogThumbs'
import React from 'react'
import { Armchair, Box, Car, PawPrint, UserRound, type LucideIcon } from 'lucide-react'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import type { MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import {
  XR_SCENE_LIBRARY_DEFAULT_ASSET_ID,
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
}: {
  Icon: LucideIcon
  color: string
  label: string
  description: string
  metadata: string
  footer: React.ReactNode
  dragPayload: MediaDragPayload
  active?: boolean
  dataAttributes?: Record<string, string>
}) {
  return (
    <article
      draggable={true}
      className={cn(mediaListItemClassName(), active ? UI_THEME_TOKENS.button.activeBg : '')}
      title={`Drag ${label} onto the Canvas`}
      aria-label={`${label}. Drag onto the Canvas.`}
      data-kg-media-draggable="1"
      data-kg-media-drag-affordance="frame"
      data-kg-media-xr-draggable="1"
      data-kg-media-list-row-layout="3-rows"
      data-kg-media-xr-card-layout="media-3-rows"
      onDragStart={event => startMediaDrag(event, dragPayload)}
      onDragEnd={finishMediaDrag}
      onPointerDownCapture={event => {
        if (!shouldPrimeMediaRowDragPayload(event)) return
        primeMediaPointerDrag(event, dragPayload)
      }}
      onPointerDown={event => {
        if (!shouldHandleMediaRowPointer(event)) return
        startMediaPointerDrag(event, dragPayload)
      }}
      onPointerMove={event => {
        if (isMediaRowControlTarget(event.target)) return
        continueMediaPointerDrag(event, dragPayload)
      }}
      onMouseDownCapture={event => {
        if (!shouldPrimeMediaRowDragPayload(event)) return
        primeMediaMouseDrag(event, dragPayload)
      }}
      onMouseDown={event => {
        if (isMediaRowControlTarget(event.target)) return
        startMediaMouseDrag(event, dragPayload)
      }}
      onMouseMove={event => {
        if (isMediaRowControlTarget(event.target)) return
        continueMediaMouseDrag(event, dragPayload)
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
