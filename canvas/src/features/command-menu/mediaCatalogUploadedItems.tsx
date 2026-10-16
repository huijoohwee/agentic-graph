import React from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { readUploadedMediaFileName, readUploadedMediaPanelItemRuntimeUrl, type UploadedMediaPanelItem } from '@/lib/storage/uploadedMediaPanelItems'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MediaDownloadOverlay, MediaInfoOverlay, MediaKindOverlay, MediaOpenLinkOverlay } from '@/lib/ui/MediaKindOverlay'
import { resolveMediaKindOverlayIcon } from '@/lib/ui/mediaKindOverlayIcon'
import { cn } from '@/lib/utils'
import {
  MediaThumbnailCaption,
  UploadedMediaPreview,
  type UploadedMediaDragMetadata,
  buildUploadedMediaDragPayload,
  continueMediaMouseDrag,
  continueMediaPointerDrag,
  finishMediaDrag,
  isMediaRowControlTarget,
  mediaCardClassName,
  mediaListItemClassName,
  mediaListThumbnailFrameClassName,
  primeMediaMouseDrag,
  primeMediaPointerDrag,
  shouldHandleMediaRowPointer,
  shouldPrimeMediaRowDragPayload,
  startMediaMouseDrag,
  startMediaPointerDrag,
  useNativeVideoMediaThumbnail,
} from './mediaCatalogShared'
import { LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS } from './mediaCatalogTypes'
import { UploadedMediaDescriptionInput, UploadedMediaInlineFieldEditor } from './mediaCatalogUploadedFields'

export function buildUploadedMediaMarkdown(args: {
  name: string
  kind: UploadedMediaPanelItem['kind']
  url: string
  contentHash: string
  objectKey: string
}): string {
  const title = args.name.replace(/[\]\n\r]/g, ' ').trim() || 'Uploaded media'
  const escapedTitle = title.replace(/"/g, '&quot;')
  const header = [
    `# Uploaded Media: ${title}`,
    '',
    `content_hash: ${args.contentHash}`,
    `object_key: ${args.objectKey}`,
    '',
  ].join('\n')
  if (args.kind === 'image') return `${header}![${title}](${args.url})\n`
  if (args.kind === 'audio') return `${header}<audio src="${args.url}" title="${escapedTitle}" controls></audio>\n`
  return `${header}<video src="${args.url}" title="${escapedTitle}" controls></video>\n`
}

export function UploadedMediaRow({
  item,
  description,
  fieldText,
  infoLabel,
  onDelete,
  onDescriptionChange,
  onDragStart,
  onFieldChange,
  onNameChange,
  onRename,
  onSelect,
  onPreview,
}: {
  item: UploadedMediaPanelItem
  description: string
  fieldText: string
  infoLabel: string
  onDelete: (item: UploadedMediaPanelItem) => void
  onDescriptionChange: (item: UploadedMediaPanelItem, nextDescription: string) => void
  onDragStart: (event: React.DragEvent<HTMLElement>, item: UploadedMediaPanelItem, metadata?: UploadedMediaDragMetadata) => void
  onFieldChange: (item: UploadedMediaPanelItem, nextFieldText: string) => void
  onNameChange: (item: UploadedMediaPanelItem, nextName: string) => void
  onRename: (item: UploadedMediaPanelItem, nextName: string) => void
  onSelect: (item: UploadedMediaPanelItem) => void
  onPreview: (item: UploadedMediaPanelItem) => void
}) {
  const [editingName, setEditingName] = React.useState(false)
  const Icon = resolveMediaKindOverlayIcon(item.kind)
  const runtimeUrl = readUploadedMediaPanelItemRuntimeUrl(item)
  const generatedThumbnail = useNativeVideoMediaThumbnail({
    contentType: item.contentType,
    explicitThumbnailUrl: item.kind === 'image' ? runtimeUrl : '',
    kind: item.kind,
    url: runtimeUrl,
  })
  const buildDragPayload = () => buildUploadedMediaDragPayload(item, generatedThumbnail)
  const commitName = (value: string) => {
    const nextName = String(value || '').trim()
    if (!nextName) {
      onNameChange(item, item.name)
      setEditingName(false)
      return
    }
    if (nextName !== item.name) onRename(item, nextName)
    setEditingName(false)
  }
  return (
    <article
      role="button"
      tabIndex={0}
      draggable={true}
      className={mediaListItemClassName()}
      onDragStart={event => onDragStart(event, item, generatedThumbnail)}
      onDragEnd={finishMediaDrag}
      data-kg-media-upload-item={item.id}
      data-kg-media-draggable="1"
      data-kg-media-upload-kind={item.kind}
      data-kg-media-upload-status={item.status}
      data-kg-media-list-row-layout="3-rows"
      onPointerDownCapture={event => {
        if (!shouldPrimeMediaRowDragPayload(event)) return
        primeMediaPointerDrag(event, buildDragPayload())
      }}
      onPointerDown={event => {
        if (!shouldHandleMediaRowPointer(event)) return
        startMediaPointerDrag(event, buildDragPayload())
      }}
      onPointerMove={event => {
        if (isMediaRowControlTarget(event.target)) return
        continueMediaPointerDrag(event, buildDragPayload())
      }}
      onMouseDownCapture={event => {
        if (!shouldPrimeMediaRowDragPayload(event)) return
        primeMediaMouseDrag(event, buildDragPayload())
      }}
      onMouseDown={event => {
        if (isMediaRowControlTarget(event.target)) return
        startMediaMouseDrag(event, buildDragPayload())
      }}
      onMouseMove={event => {
        if (isMediaRowControlTarget(event.target)) return
        continueMediaMouseDrag(event, buildDragPayload())
      }}
      onClick={event => {
        if (isMediaRowControlTarget(event.target)) return
        onSelect(item)
      }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect(item)
      }}
    >
      <button
        type="button"
        className={cn(mediaListThumbnailFrameClassName(), 'cursor-grab active:cursor-grabbing')}
        title={`Preview ${item.name}`}
        aria-label={`Preview ${item.name}`}
        draggable={true}
        data-kg-media-drag-affordance="frame"
        data-kg-media-thumbnail-fullscreen={item.id}
        data-kg-media-draggable="1"
        data-kg-media-row-control="1"
        onPointerDown={event => startMediaPointerDrag(event, buildDragPayload())}
        onPointerMove={event => continueMediaPointerDrag(event, buildDragPayload())}
        onMouseDown={event => startMediaMouseDrag(event, buildDragPayload())}
        onMouseMove={event => continueMediaMouseDrag(event, buildDragPayload())}
        onDragStart={event => onDragStart(event, item, generatedThumbnail)}
        onDragEnd={finishMediaDrag}
        onClick={event => {
          event.stopPropagation()
          onPreview(item)
        }}
      >
        <MediaKindOverlay Icon={Icon} label={item.kind} appearance="hover" />
        <MediaInfoOverlay label={infoLabel} appearance="hover" />
        <MediaOpenLinkOverlay href={runtimeUrl} appearance="hover" />
        <MediaDownloadOverlay href={runtimeUrl} kind={item.kind} appearance="hover" />
        {generatedThumbnail.url ? (
          <>
            <img
              src={generatedThumbnail.url}
              alt=""
              className="h-full w-full rounded object-cover"
              data-kg-command-menu-media-thumbnail="1"
              data-kg-command-menu-media-thumbnail-format={generatedThumbnail.format || undefined}
              data-kg-command-menu-media-thumbnail-raster-format={generatedThumbnail.rasterFormat || undefined}
              data-kg-command-menu-media-thumbnail-time={generatedThumbnail.timestampSeconds ?? undefined}
              loading="lazy"
              decoding="async"
              {...LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS}
              draggable={true}
              onPointerDown={event => startMediaPointerDrag(event, buildDragPayload())}
              onPointerMove={event => continueMediaPointerDrag(event, buildDragPayload())}
              onMouseDown={event => startMediaMouseDrag(event, buildDragPayload())}
              onMouseMove={event => continueMediaMouseDrag(event, buildDragPayload())}
              onDragStart={event => onDragStart(event, item, generatedThumbnail)}
              onDragEnd={finishMediaDrag}
            />
            <MediaThumbnailCaption format={generatedThumbnail.format} rasterFormat={generatedThumbnail.rasterFormat} timestampSeconds={generatedThumbnail.timestampSeconds} />
          </>
        ) : (
          <Icon className={cn('m-auto h-4 w-4', UI_THEME_TOKENS.text.tertiary)} aria-hidden />
        )}
      </button>
      <section className="grid min-w-0 grid-rows-[auto_auto_auto] gap-1" aria-label={`${item.name} uploaded media summary`}>
        <header className="flex min-w-0 items-center justify-between gap-2" data-kg-media-list-row-section="title">
          {editingName ? (
            <input
              type="text"
              value={item.name}
              aria-label={`Rename ${item.name}`}
              className={cn(
                'min-w-0 max-w-full truncate rounded border border-transparent bg-transparent px-1 py-0 text-xs font-semibold outline-none',
                UI_THEME_TOKENS.text.primary,
                'focus:border-[color:var(--kg-border)] focus:bg-[color:var(--kg-panel-bg)]',
              )}
              data-kg-media-upload-name-input={item.id}
              data-kg-media-row-control="1"
              onClick={event => event.stopPropagation()}
              onPointerDown={event => event.stopPropagation()}
              onChange={event => onNameChange(item, event.target.value)}
              onInput={event => onNameChange(item, event.currentTarget.value)}
              onBlur={event => commitName(event.currentTarget.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitName(event.currentTarget.value)
                  event.currentTarget.blur()
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onNameChange(item, item.storage ? readUploadedMediaFileName(item.storage) : item.name)
                  setEditingName(false)
                  event.currentTarget.blur()
                }
              }}
              autoFocus
            />
          ) : (
            <span className="flex min-w-0 items-center gap-1">
              <span
                className={cn('min-w-0 truncate px-1 text-xs font-semibold', UI_THEME_TOKENS.text.primary)}
                title={item.name}
                data-kg-media-upload-name-text={item.id}
              >
                {item.name}
              </span>
              <button
                type="button"
                className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border opacity-70 hover:opacity-100', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
                title={`Rename ${item.name}`}
                aria-label={`Rename ${item.name}`}
                data-kg-media-upload-rename={item.id}
                data-kg-media-row-control="1"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation()
                  setEditingName(true)
                }}
              >
                <Pencil className="h-3 w-3" aria-hidden />
              </button>
            </span>
          )}
          <button
            type="button"
            className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
            title="Delete media"
            aria-label={`Delete ${item.name}`}
            data-kg-media-upload-delete={item.id}
            data-kg-media-row-control="1"
            onClick={event => {
              event.stopPropagation()
              onDelete(item)
            }}
          >
            <Trash2 className="h-3 w-3" aria-hidden />
          </button>
        </header>
        <section className="flex min-w-0 flex-wrap items-center gap-1" data-kg-media-list-row-section="meta">
          <UploadedMediaDescriptionInput
            item={item}
            description={description}
            onDescriptionChange={onDescriptionChange}
          />
          <UploadedMediaInlineFieldEditor
            item={item}
            value={fieldText}
            onChange={onFieldChange}
          />
        </section>
      </section>
    </article>
  )
}

export function UploadedMediaCard({
  item,
  description,
  fieldText,
  infoLabel,
  onDelete,
  onDescriptionChange,
  onDragStart,
  onFieldChange,
  onNameChange,
  onRename,
  onSelect,
  onPreview,
}: {
  item: UploadedMediaPanelItem
  description: string
  fieldText: string
  infoLabel: string
  onDelete: (item: UploadedMediaPanelItem) => void
  onDescriptionChange: (item: UploadedMediaPanelItem, nextDescription: string) => void
  onDragStart: (event: React.DragEvent<HTMLElement>, item: UploadedMediaPanelItem, metadata?: UploadedMediaDragMetadata) => void
  onFieldChange: (item: UploadedMediaPanelItem, nextFieldText: string) => void
  onNameChange: (item: UploadedMediaPanelItem, nextName: string) => void
  onRename: (item: UploadedMediaPanelItem, nextName: string) => void
  onSelect: (item: UploadedMediaPanelItem) => void
  onPreview: (item: UploadedMediaPanelItem) => void
}) {
  const [editingName, setEditingName] = React.useState(false)
  const runtimeUrl = readUploadedMediaPanelItemRuntimeUrl(item)
  const generatedThumbnail = useNativeVideoMediaThumbnail({
    contentType: item.contentType,
    explicitThumbnailUrl: item.kind === 'image' ? runtimeUrl : '',
    kind: item.kind,
    url: runtimeUrl,
  })
  const buildDragPayload = () => buildUploadedMediaDragPayload(item, generatedThumbnail)
  const commitName = (value: string) => {
    const nextName = String(value || '').trim()
    if (!nextName) {
      onNameChange(item, item.name)
      setEditingName(false)
      return
    }
    if (nextName !== item.name) onRename(item, nextName)
    setEditingName(false)
  }
  return (
    <article
      role="button"
      tabIndex={0}
      draggable={true}
      className={mediaCardClassName()}
      onDragStart={event => onDragStart(event, item, generatedThumbnail)}
      onDragEnd={finishMediaDrag}
      data-kg-media-drag-affordance="frame"
      data-kg-media-upload-item={item.id}
      data-kg-media-draggable="1"
      data-kg-media-upload-kind={item.kind}
      data-kg-media-upload-status={item.status}
      onPointerDownCapture={event => {
        if (!shouldPrimeMediaRowDragPayload(event)) return
        primeMediaPointerDrag(event, buildDragPayload())
      }}
      onPointerDown={event => {
        if (!shouldHandleMediaRowPointer(event)) return
        startMediaPointerDrag(event, buildDragPayload())
      }}
      onPointerMove={event => {
        if (isMediaRowControlTarget(event.target)) return
        continueMediaPointerDrag(event, buildDragPayload())
      }}
      onMouseDownCapture={event => {
        if (!shouldPrimeMediaRowDragPayload(event)) return
        primeMediaMouseDrag(event, buildDragPayload())
      }}
      onMouseDown={event => {
        if (isMediaRowControlTarget(event.target)) return
        startMediaMouseDrag(event, buildDragPayload())
      }}
      onMouseMove={event => {
        if (isMediaRowControlTarget(event.target)) return
        continueMediaMouseDrag(event, buildDragPayload())
      }}
      onClick={event => {
        if (isMediaRowControlTarget(event.target)) return
        onSelect(item)
      }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect(item)
      }}
    >
      <UploadedMediaPreview item={item} infoLabel={infoLabel} onDragStart={onDragStart} onPreview={onPreview} />
      <header className="min-w-0 px-2 pt-2">
        {editingName ? (
          <input
            type="text"
            value={item.name}
            aria-label={`Rename ${item.name}`}
            className={cn(
              'min-w-0 max-w-full truncate rounded border border-transparent bg-transparent px-1 py-0 text-xs font-semibold outline-none',
              UI_THEME_TOKENS.text.primary,
              'focus:border-[color:var(--kg-border)] focus:bg-[color:var(--kg-panel-bg)]',
            )}
            data-kg-media-upload-name-input={item.id}
            data-kg-media-row-control="1"
            onClick={event => event.stopPropagation()}
            onPointerDown={event => event.stopPropagation()}
            onChange={event => onNameChange(item, event.target.value)}
            onInput={event => onNameChange(item, event.currentTarget.value)}
            onBlur={event => commitName(event.currentTarget.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitName(event.currentTarget.value)
                event.currentTarget.blur()
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                onNameChange(item, item.storage ? readUploadedMediaFileName(item.storage) : item.name)
                setEditingName(false)
                event.currentTarget.blur()
              }
            }}
            autoFocus
          />
        ) : (
          <span className="flex min-w-0 items-center gap-1">
            <span
              className={cn('min-w-0 truncate px-1 text-xs font-semibold', UI_THEME_TOKENS.text.primary)}
              title={item.name}
              data-kg-media-upload-name-text={item.id}
            >
              {item.name}
            </span>
            <button
              type="button"
              className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border opacity-70 hover:opacity-100', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
              title={`Rename ${item.name}`}
              aria-label={`Rename ${item.name}`}
              data-kg-media-upload-rename={item.id}
              data-kg-media-row-control="1"
              onPointerDown={event => event.stopPropagation()}
              onClick={event => {
                event.stopPropagation()
                setEditingName(true)
              }}
            >
              <Pencil className="h-3 w-3" aria-hidden />
            </button>
          </span>
        )}
      </header>
      <section className="flex min-w-0 flex-wrap items-center gap-1 px-2 pt-1" data-kg-media-list-row-section="meta">
        <UploadedMediaDescriptionInput
          item={item}
          description={description}
          onDescriptionChange={onDescriptionChange}
        />
        <UploadedMediaInlineFieldEditor
          item={item}
          value={fieldText}
          onChange={onFieldChange}
        />
      </section>
      <menu className={cn('m-0 mt-2 flex list-none items-center justify-end gap-2 border-t px-2 py-2', UI_THEME_TOKENS.panel.border)} aria-label={`${item.name} media actions`}>
        <li className="list-none">
          <button
            type="button"
            className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
            title="Delete media"
            aria-label={`Delete ${item.name}`}
            data-kg-media-upload-delete={item.id}
            data-kg-media-row-control="1"
            onClick={event => {
              event.stopPropagation()
              onDelete(item)
            }}
          >
            <Trash2 className="h-3 w-3" aria-hidden />
          </button>
        </li>
      </menu>
    </article>
  )
}
