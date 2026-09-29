import React from 'react'
import type { UploadedMediaPanelItem } from '@/lib/storage/uploadedMediaPanelItems'
import { readUploadedMediaPanelDedupeKey } from '@/lib/storage/uploadedMediaPanelItems'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { readPreferredImageFormat, readPreferredVideoFormat } from '@/lib/media/mediaFormatPreference'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { cn } from '@/lib/utils'
import type { UploadedMediaDescriptionDrafts, UploadedMediaFieldDrafts } from './mediaCatalogTypes'
import { getUploadedMediaDescriptionKey } from './mediaCatalogShared'

export function buildUploadedMediaDescriptionFallback(item: UploadedMediaPanelItem): string {
  const name = String(item.name || '').trim()
  const kind = item.kind.charAt(0).toUpperCase() + item.kind.slice(1)
  return name ? `${kind} media: ${name}` : `${kind} media description`
}

export function readUploadedMediaDescription(
  drafts: UploadedMediaDescriptionDrafts,
  item: UploadedMediaPanelItem,
): string {
  return String(drafts[getUploadedMediaDescriptionKey(item)] || '').trim() || buildUploadedMediaDescriptionFallback(item)
}

export function readUploadedMediaFieldText(
  drafts: UploadedMediaFieldDrafts,
  item: UploadedMediaPanelItem,
): string {
  return String(drafts[getUploadedMediaDescriptionKey(item)] || '').trim() || buildUploadedMediaDefaultFieldTokens(item).join(' ')
}

export function normalizeUploadedMediaFieldText(value: string): string {
  return String(value || '')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => {
      const normalized = token.startsWith('#') ? token : `#${token}`
      return normalized.replace(/[^#A-Za-z0-9-]/g, '-').replace(/-{2,}/g, '-')
    })
    .filter(token => /^#[A-Za-z0-9][A-Za-z0-9-]*$/.test(token))
    .join(' ')
}

export function buildUploadedMediaInfoLabel(item: UploadedMediaPanelItem): string {
  const storage = item.storage?.response.storage
  if (storage) return `R2 ${storage.r2}; D1 ${storage.d1}; KV ${storage.kv}; DO ${storage.durableObject}`
  if (item.status === 'uploading') return 'Uploading to runtime storage'
  return item.error || 'Local preview; runtime sync disabled or unavailable'
}

export function buildUploadedMediaDefaultFieldTokens(item: UploadedMediaPanelItem): string[] {
  const tags = new Set<string>([`#${item.kind}`])
  const contentType = String(item.contentType || '').toLowerCase()
  const mediaUrl = String(item.linkUrl || item.name || '').trim()
  const format = item.kind === 'video'
    ? readPreferredVideoFormat(mediaUrl, contentType)
    : item.kind === 'image'
      ? readPreferredImageFormat(mediaUrl, contentType)
      : contentType.split('/').pop() || String(item.name || '').split('.').pop()?.toLowerCase() || ''
  if (format) tags.add(`#${format.replace(/[^a-z0-9-]/g, '-')}`)
  tags.add(item.status === 'synced' ? '#synced' : item.status === 'uploading' ? '#uploading' : '#local')
  const storage = item.storage?.response.storage
  if (storage?.r2 === 'confirmed') tags.add('#r2')
  if (storage?.d1 === 'persisted') tags.add('#d1')
  if (item.sizeBytes > 0) tags.add(`#${Math.ceil(item.sizeBytes / 1024)}kb`)
  return Array.from(tags).slice(0, 6)
}

export function UploadedMediaDescriptionInput({
  item,
  description,
  onDescriptionChange,
  className,
}: {
  item: UploadedMediaPanelItem
  description: string
  onDescriptionChange: (item: UploadedMediaPanelItem, nextDescription: string) => void
  className?: string
}) {
  return (
    <input
      type="text"
      value={description}
      placeholder="Add media description"
      aria-label={`Describe ${item.name}`}
      className={cn(
        'min-w-0 max-w-full truncate rounded border border-transparent bg-transparent px-1 py-0 text-xs outline-none',
        '!inline-block',
        UI_THEME_TOKENS.text.secondary,
        'focus:border-[color:var(--kg-border)] focus:bg-[color:var(--kg-panel-bg)]',
        className,
      )}
      data-kg-media-description-input={item.id}
      data-kg-media-row-control="1"
      style={{ display: 'inline-block' }}
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onChange={event => onDescriptionChange(item, event.target.value)}
      onInput={event => onDescriptionChange(item, event.currentTarget.value)}
    />
  )
}

export function UploadedMediaInlineFieldEditor({
  item,
  value,
  onChange,
  className,
}: {
  item: UploadedMediaPanelItem
  value: string
  onChange: (item: UploadedMediaPanelItem, nextValue: string) => void
  className?: string
}) {
  const [editing, setEditing] = React.useState(false)
  const normalizedValue = normalizeUploadedMediaFieldText(value)
  const commit = (nextValue: string) => {
    onChange(item, normalizeUploadedMediaFieldText(nextValue))
    setEditing(false)
  }
  if (editing) {
    return (
      <input
        type="text"
        value={value}
        aria-label={`Edit # metadata for ${item.name}`}
        className={cn(
          'min-w-[7rem] max-w-full flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0 font-mono text-xs outline-none',
          UI_THEME_TOKENS.text.tertiary,
          'focus:border-[color:var(--kg-border)] focus:bg-[color:var(--kg-panel-bg)]',
          className,
        )}
        data-kg-media-field-input={item.id}
        data-kg-media-row-control="1"
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
        onChange={event => onChange(item, event.target.value)}
        onInput={event => onChange(item, event.currentTarget.value)}
        onBlur={event => commit(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(event.currentTarget.value)
            event.currentTarget.blur()
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setEditing(false)
            event.currentTarget.blur()
          }
        }}
        autoFocus
      />
    )
  }
  return (
    <button
      type="button"
      className={cn(
        UI_INLINE_CHIP_GROUP_CLASSNAME,
        'border-0 bg-transparent p-0 text-left align-baseline',
        UI_THEME_TOKENS.text.tertiary,
        className,
      )}
      title={`Edit # metadata: ${normalizedValue}`}
      aria-label={`Edit # metadata for ${item.name}`}
      data-kg-media-field-tags-inline="1"
      data-kg-media-row-control="1"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation()
        setEditing(true)
      }}
    >
      {renderMarkdownSigilInlineText(normalizedValue)}
    </button>
  )
}
