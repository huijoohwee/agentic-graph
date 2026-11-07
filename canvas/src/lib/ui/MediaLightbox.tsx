import React from 'react'
import { Image as ImageIcon, Wand2, X } from 'lucide-react'
import RichMediaPanel from '@/components/RichMediaPanel'
import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import type { MarkdownMediaDownloadKind } from '@/lib/markdown-core/ui/mediaDownload'
import PreviewOverlay from '@/features/panels/views/preview-panel/ui/PreviewOverlay'
import { PanelSelect, PanelTextarea } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  MEDIA_EXPANDED_PREVIEW_OVERLAY_CLASS_NAME,
  MEDIA_EXPANDED_PREVIEW_PANEL_CLASS_NAME,
  MEDIA_EXPANDED_PREVIEW_PLAYER_CLASS_NAME,
  MEDIA_EXPANDED_PREVIEW_PLAYER_FRAME_CLASS_NAME,
  MEDIA_EXPANDED_PREVIEW_MEDIA_CLASS_NAME,
  MEDIA_EXPANDED_PREVIEW_RICH_PANEL_CLASS_NAME,
} from './mediaExpandedPreviewLayout'
import { MediaExpandedPreviewFullscreenButton } from './MediaExpandedPreviewFullscreenButton'

export type MediaLightboxPromptParameterOption = {
  value: string
  label: string
}

export type MediaLightboxPromptParameter = {
  id: string
  label: string
  value?: string
  options: readonly MediaLightboxPromptParameterOption[]
}

export type MediaLightboxPromptParameters = Record<string, string>

type MediaLightboxProps = {
  open: boolean
  src: string
  alt: string
  kind: MarkdownMediaDownloadKind
  title?: string
  description?: string
  descriptionLabel?: string
  promptValue?: string
  promptPlaceholder?: string
  promptSubmitLabel?: string
  promptSubmitting?: boolean
  promptParameters?: readonly MediaLightboxPromptParameter[]
  onPromptChange?: (value: string) => void
  onPromptSubmit?: (value: string, parameters?: MediaLightboxPromptParameters) => void | Promise<void>
  onClose: () => void
}

function normalizePromptDraft(value: string): string {
  return String(value || '').replace(/\r\n?/g, '\n').trim()
}

function readPromptParameterValues(parameters: readonly MediaLightboxPromptParameter[]): MediaLightboxPromptParameters {
  const values: MediaLightboxPromptParameters = {}
  for (const parameter of parameters) {
    const id = String(parameter.id || '').trim()
    if (!id || parameter.options.length === 0) continue
    const currentValue = String(parameter.value || '').trim()
    const fallbackValue = String(parameter.options[0]?.value || '').trim()
    values[id] = currentValue || fallbackValue
  }
  return values
}

export function MediaLightbox({
  open,
  src,
  alt,
  kind,
  title,
  description,
  descriptionLabel,
  promptValue,
  promptPlaceholder,
  promptSubmitLabel,
  promptSubmitting,
  promptParameters,
  onPromptChange,
  onPromptSubmit,
  onClose,
}: MediaLightboxProps) {
  const rootRef = React.useRef<HTMLElement | null>(null)
  const [promptDraft, setPromptDraft] = React.useState(() => normalizePromptDraft(String(promptValue ?? description ?? '')))
  const [parameterValues, setParameterValues] = React.useState<MediaLightboxPromptParameters>(() => readPromptParameterValues(promptParameters || []))
  const [promptPending, setPromptPending] = React.useState(false)
  const displayTitle = String(title || '').trim()
  const detailText = String(description || '').replace(/\s+/g, ' ').trim()
  const detailLabel = String(descriptionLabel || 'Prompt').replace(/\s+/g, ' ').trim()
  const promptDraftSeed = normalizePromptDraft(String(promptValue ?? description ?? ''))
  const editablePrompt = Boolean(onPromptChange || onPromptSubmit)
  const promptBusy = Boolean(promptSubmitting || promptPending)
  const canSubmitPrompt = Boolean(onPromptSubmit && promptDraft.trim() && !promptBusy)
  const parameterControls = React.useMemo(
    () => (promptParameters || []).filter(parameter => String(parameter.id || '').trim() && parameter.options.length > 0),
    [promptParameters],
  )
  const hasDetails = editablePrompt || !!detailText
  const hasMediaSource = !!String(src || '').trim()
  const isImage = kind === 'image'
  const isVideo = kind === 'video'
  React.useEffect(() => {
    if (!open) return
    setPromptDraft(promptDraftSeed)
  }, [open, promptDraftSeed])

  React.useEffect(() => {
    if (!open) return
    setParameterValues(readPromptParameterValues(parameterControls))
  }, [open, parameterControls])

  const submitPrompt = React.useCallback(() => {
    if (!onPromptSubmit || promptBusy) return
    const nextPrompt = promptDraft.trim()
    if (!nextPrompt) return
    const result = onPromptSubmit(nextPrompt, parameterValues)
    if (result && typeof (result as Promise<void>).then === 'function') {
      setPromptPending(true)
      void Promise.resolve(result).finally(() => setPromptPending(false))
    }
  }, [onPromptSubmit, parameterValues, promptBusy, promptDraft])

  return (
    <PreviewOverlay
      open={open && (hasMediaSource || editablePrompt)}
      onClose={onClose}
      overlayClassName={MEDIA_EXPANDED_PREVIEW_OVERLAY_CLASS_NAME}
      panelClassName={MEDIA_EXPANDED_PREVIEW_PANEL_CLASS_NAME}
    >
      <section
        ref={rootRef}
        className="relative grid h-full w-full grid-rows-[3rem_minmax(0,1fr)_auto] bg-black text-white"
        data-kg-media-lightbox="1"
        data-kg-media-lightbox-kind={kind}
        aria-label="Media lightbox"
      >
        <header className="relative z-20 flex min-w-0 items-center justify-center px-14">
          {displayTitle ? (
            <h2 className="truncate text-sm font-semibold text-white" data-kg-media-lightbox-title="1">
              {displayTitle}
            </h2>
          ) : (
            <span className="sr-only">{alt}</span>
          )}
        </header>
        <menu
          className="absolute right-2 top-2 z-20 m-0 flex list-none items-center gap-1 p-0"
          aria-label="Media lightbox actions"
        >
          <li className="list-none">
            <MediaExpandedPreviewFullscreenButton
              targetRef={rootRef}
              dataAttributes={{ 'data-kg-media-lightbox-fullscreen': '1' }}
            />
          </li>
          <li className="list-none">
            <button
              type="button"
              className={cn('inline-flex h-8 w-8 items-center justify-center rounded border bg-black/50 text-white backdrop-blur-sm', UI_THEME_TOKENS.panel.border)}
              title="Close"
              aria-label="Close media lightbox"
              data-kg-media-lightbox-close="1"
              onClick={event => {
                event.stopPropagation()
                onClose()
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </li>
        </menu>
        <section className="min-h-0" aria-label="Generated media output" data-kg-media-lightbox-media-panel="1">
          {!hasMediaSource ? (
            <section className="grid h-full w-full place-items-center p-6" data-kg-media-lightbox-empty-output="1">
              <section className={cn('grid min-h-48 w-[min(88vw,36rem)] place-items-center gap-3 rounded border border-dashed p-6 text-center', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}>
                <ImageIcon className={cn('h-8 w-8', UI_THEME_TOKENS.text.tertiary)} aria-hidden />
                <p className={cn('m-0 max-w-sm text-sm', UI_THEME_TOKENS.text.secondary)}>Generated media will appear here.</p>
              </section>
            </section>
          ) : (
            <section className={MEDIA_EXPANDED_PREVIEW_PLAYER_CLASS_NAME} data-kg-media-lightbox-player="1">
              <section className={MEDIA_EXPANDED_PREVIEW_PLAYER_FRAME_CLASS_NAME}>
                {isImage ? (
                  <section className={MEDIA_EXPANDED_PREVIEW_MEDIA_CLASS_NAME} data-kg-media-lightbox-image="1">
                    <section className={MEDIA_EXPANDED_PREVIEW_RICH_PANEL_CLASS_NAME} data-kg-media-lightbox-image-panel="1">
                      <RichMediaPanel
                        overlayId="media-lightbox-image"
                        title={displayTitle || alt || 'Image'}
                        url={src}
                        openUrl={src}
                        kind="image"
                        interactive={false}
                        panelChrome="storyboardWidget"
                        frameMode="surface"
                        placementOwner="parent"
                      />
                    </section>
                  </section>
                ) : isVideo ? (
                  <section className={MEDIA_EXPANDED_PREVIEW_MEDIA_CLASS_NAME} data-kg-media-lightbox-video="1">
                    <section className={MEDIA_EXPANDED_PREVIEW_RICH_PANEL_CLASS_NAME} data-kg-media-lightbox-video-panel="1">
                      <RichMediaPanel
                        overlayId="media-lightbox-video"
                        title={displayTitle || alt || 'Video'}
                        url={src}
                        openUrl={src}
                        kind="video"
                        interactive
                        videoControls
                        panelChrome="storyboardWidget"
                        frameMode="surface"
                        placementOwner="parent"
                      />
                    </section>
                  </section>
                ) : (
                  <section className="grid h-full w-full max-h-[24rem] place-items-center gap-4" data-kg-media-lightbox-audio="1">
                    <section className="w-full max-w-3xl">
                      <CardMediaPreview
                        kind="audio"
                        title={displayTitle || alt || 'Audio'}
                        url={src}
                        href={src}
                        interactive
                        fit="contain"
                        mediaClassName="h-full w-full"
                      />
                    </section>
                  </section>
                )}
                <span className="sr-only">{alt}</span>
              </section>
            </section>
          )}
        </section>
        {hasDetails ? (
          <section className={cn('mx-auto mb-5 grid w-[min(92vw,38rem)] gap-3 rounded-lg border p-4 text-sm shadow-[var(--kg-shadow-overlay)] backdrop-blur-md', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.tooltip.bg, UI_THEME_TOKENS.tooltip.text)} aria-label={detailLabel || 'Prompt'} data-kg-media-lightbox-details="1" data-kg-media-lightbox-prompt-panel="1">
            {editablePrompt ? (
              <section
                className="grid gap-3"
                data-kg-media-lightbox-prompt-form="1"
              >
                <label className="grid gap-1">
                  <span className={cn('text-xs font-semibold uppercase tracking-normal', UI_THEME_TOKENS.text.secondary)}>
                    {detailLabel}
                  </span>
                  <PanelTextarea
                    value={promptDraft}
                    placeholder={promptPlaceholder || 'Describe the media to generate'}
                    disabled={promptBusy}
                    onChange={event => {
                      const nextValue = event.currentTarget.value
                      setPromptDraft(nextValue)
                      onPromptChange?.(nextValue)
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        submitPrompt()
                      }
                    }}
                    rows={3}
                    data-kg-media-lightbox-description="1"
                    data-kg-media-lightbox-prompt="1"
                    data-kg-media-lightbox-prompt-input="1"
                  />
                </label>
                {parameterControls.length > 0 ? (
                  <footer className={cn('flex min-w-0 items-center gap-2 border-t pt-2', UI_THEME_TOKENS.panel.divider)} data-kg-media-lightbox-parameter-row="1">
                    <section className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" aria-label="Media generation parameters">
                      {parameterControls.map(parameter => (
                        <label
                          key={parameter.id}
                          className={cn(
                            'block shrink-0',
                            parameter.id === 'model' ? 'w-[13.25rem]' : 'w-[5.25rem]',
                          )}
                        >
                          <span className="sr-only">{parameter.label}</span>
                          <PanelSelect
                            value={parameterValues[parameter.id] || parameter.options[0]?.value || ''}
                            disabled={promptBusy}
                            onValueChange={selectedValueInput => {
                              const nextValue = selectedValueInput
                              setParameterValues(current => ({
                                ...current,
                                [parameter.id]: nextValue,
                              }))
                            }}
                            data-kg-media-lightbox-parameter={parameter.id}
                          >
                            {parameter.options.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </PanelSelect>
                        </label>
                      ))}
                    </section>
                  </footer>
                ) : null}
                <footer className="flex justify-end">
                  <button
                    type="button"
                    className={cn('inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-semibold', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg)}
                    disabled={!canSubmitPrompt}
                    title={promptSubmitLabel || 'Generate media'}
                    aria-label={promptSubmitLabel || 'Generate media'}
                    data-kg-media-lightbox-prompt-submit="1"
                    onClick={submitPrompt}
                  >
                    <Wand2 className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">{promptSubmitLabel || 'Generate media'}</span>
                  </button>
                </footer>
              </section>
            ) : detailText ? <p className="m-0 leading-relaxed" data-kg-media-lightbox-description="1" data-kg-media-lightbox-prompt="1">{detailText}</p> : null}
          </section>
        ) : null}
      </section>
    </PreviewOverlay>
  )
}
