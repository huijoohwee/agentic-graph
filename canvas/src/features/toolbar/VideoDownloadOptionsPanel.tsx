import { PanelSelect } from '@/lib/ui/panelFormControls'
import React from 'react'
import { Loader2 } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import type { VideoDownloadOptions } from '@/lib/video-download/types'

export const VIDEO_DOWNLOAD_FORMAT_PRESETS = [
  { id: 'best', label: 'Best' },
  { id: 'mp4', label: 'MP4' },
  { id: 'mp3', label: 'MP3' },
  { id: 'bestvideo+bestaudio', label: 'Best A/V' },
  { id: '__custom__', label: 'Custom' },
] as const

const VIDEO_DOWNLOAD_MEDIA_PRESETS = [
  { id: 'video-audio', label: 'Video + audio' },
  { id: 'audio', label: 'Audio only' },
] as const

const VIDEO_DOWNLOAD_QUALITY_PRESETS = [
  { id: 'best', label: 'Best available' },
  { id: '1080p', label: '1080p' },
  { id: '720p', label: '720p' },
  { id: '480p', label: '480p' },
  { id: '360p', label: '360p' },
  { id: 'audio-best', label: 'Audio best' },
  { id: 'audio-compact', label: 'Audio compact' },
] as const

const DEFAULT_FORMAT = 'best'
const CUSTOM_FORMAT_SENTINEL = '__custom__'
const DEFAULT_MEDIA_KIND = 'video-audio'
const DEFAULT_QUALITY = 'best'

function normalizePresetValue(format: unknown): string {
  const value = typeof format === 'string' && format.trim() ? format.trim() : DEFAULT_FORMAT
  return VIDEO_DOWNLOAD_FORMAT_PRESETS.some(preset => preset.id === value) ? value : CUSTOM_FORMAT_SENTINEL
}

export function VideoDownloadOptionsPanel(props: {
  options: VideoDownloadOptions
  onOptionsChange: (next: VideoDownloadOptions) => void
  onConfirm: () => void
  onCancel: () => void
  isDownloading: boolean
  endpointConfigured: boolean
}) {
  const format = typeof props.options.format === 'string' && props.options.format.trim()
    ? props.options.format.trim()
    : DEFAULT_FORMAT
  const presetValue = normalizePresetValue(format)
  const customFormat = presetValue === CUSTOM_FORMAT_SENTINEL ? format : ''
  const mediaKind = props.options.mediaKind === 'audio' ? 'audio' : DEFAULT_MEDIA_KIND
  const quality = VIDEO_DOWNLOAD_QUALITY_PRESETS.some(preset => preset.id === props.options.quality)
    ? props.options.quality || DEFAULT_QUALITY
    : DEFAULT_QUALITY
  const subtitleLang = typeof props.options.subtitleLang === 'string' ? props.options.subtitleLang : ''
  const confirmDisabled = props.isDownloading || !props.endpointConfigured

  return (
    <section
      aria-label="Video download options"
      className={cn('mt-2 min-w-0 rounded border p-2 text-xs', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border)}
    >
      {!props.endpointConfigured ? (
        <p role="alert" className="mb-2 m-0 text-amber-700 dark:text-amber-300">
          Configure VITE_VIDEO_DOWNLOAD_ENDPOINT before downloading.
        </p>
      ) : null}

      <label className={cn('mb-1 block', UI_THEME_TOKENS.text.secondary)}>
        Format
        <PanelSelect
          className={cn('mt-1 w-full rounded border px-2 py-1', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.text)}
          aria-label="Video format"
          value={presetValue}
          onValueChange={selectedValueInput => {
            const value = selectedValueInput
            props.onOptionsChange({
              ...props.options,
              format: value === CUSTOM_FORMAT_SENTINEL ? '' : value,
            })
          }}
        >
          {VIDEO_DOWNLOAD_FORMAT_PRESETS.map(preset => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </PanelSelect>
      </label>

      <section className="mb-2 grid min-w-0 grid-cols-2 gap-2">
        <label className={cn('block min-w-0', UI_THEME_TOKENS.text.secondary)}>
          Media
          <PanelSelect
            className={cn('mt-1 w-full rounded border px-2 py-1', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.text)}
            aria-label="Video download media"
            value={mediaKind}
            onValueChange={selectedValueInput => {
              const nextMediaKind = selectedValueInput === 'audio' ? 'audio' : DEFAULT_MEDIA_KIND
              props.onOptionsChange({
                ...props.options,
                mediaKind: nextMediaKind,
                quality: nextMediaKind === 'audio' && props.options.quality && !String(props.options.quality).startsWith('audio')
                  ? 'audio-best'
                  : props.options.quality,
              })
            }}
          >
            {VIDEO_DOWNLOAD_MEDIA_PRESETS.map(preset => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </PanelSelect>
        </label>

        <label className={cn('block min-w-0', UI_THEME_TOKENS.text.secondary)}>
          Quality
          <PanelSelect
            className={cn('mt-1 w-full rounded border px-2 py-1', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.text)}
            aria-label="Video download quality"
            value={quality}
            onValueChange={selectedValueInput => props.onOptionsChange({ ...props.options, quality: selectedValueInput as VideoDownloadOptions['quality'] })}
          >
            {VIDEO_DOWNLOAD_QUALITY_PRESETS.map(preset => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </PanelSelect>
        </label>
      </section>

      {presetValue === CUSTOM_FORMAT_SENTINEL ? (
        <input
          className={cn('mb-2 w-full rounded border px-2 py-1', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.text)}
          aria-label="Custom format string"
          maxLength={64}
          value={customFormat}
          onChange={event => props.onOptionsChange({ ...props.options, format: event.target.value.slice(0, 64) })}
        />
      ) : null}

      <input
        className={cn('mb-2 w-full rounded border px-2 py-1', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.text)}
        aria-label="Subtitle language"
        placeholder="Subtitle language"
        maxLength={35}
        value={subtitleLang}
        onChange={event => props.onOptionsChange({ ...props.options, subtitleLang: event.target.value.slice(0, 35) })}
      />

      <section className="flex min-w-0 items-center justify-end gap-1">
        <button
          type="button"
          className={cn('rounded border px-2 py-1', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded border px-2 py-1',
            UI_THEME_TOKENS.input.border,
            confirmDisabled ? UI_THEME_TOKENS.text.tertiary : UI_THEME_TOKENS.button.text,
            !confirmDisabled ? UI_THEME_TOKENS.button.hoverBg : '',
          )}
          disabled={confirmDisabled}
          onClick={props.onConfirm}
        >
          {props.isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          <span>{props.isDownloading ? 'Downloading…' : 'Confirm Download'}</span>
        </button>
      </section>
    </section>
  )
}
