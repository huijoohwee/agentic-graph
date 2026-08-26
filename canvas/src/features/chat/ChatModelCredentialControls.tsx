import React from 'react'
import { Bot, ChevronDown, KeyRound } from 'lucide-react'
import { UI_COPY } from '@/lib/config'
import {
  UI_RESPONSIVE_COMPACT_PANEL_FIELD_INPUT_CLASSNAME,
  UI_RESPONSIVE_CONTROL_COMPACT_VALUE_ROW_CLASSNAME,
  UI_RESPONSIVE_CONTROL_ICON_CELL_CLASSNAME,
  UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'

export type ChatModelCredentialControlsProps = {
  modelId: string
  modelOptions: string[]
  onModelChanged: (modelId: string) => void
  apiKeyPrompt?: {
    providerLabel: string
    credentialLabel: string
    value: string
    onChange: (value: string) => void
  } | null
  disabled?: boolean
  uiPanelMicroLabelTextSizeClass: string
}

export function ChatModelCredentialControls({
  modelId,
  modelOptions,
  onModelChanged,
  apiKeyPrompt,
  disabled = false,
  uiPanelMicroLabelTextSizeClass,
}: ChatModelCredentialControlsProps) {
  const chatModelSelectId = React.useId()
  const chatApiKeyInputId = React.useId()
  const [isApiKeyExpanded, setIsApiKeyExpanded] = React.useState(false)

  React.useEffect(() => {
    if (!apiKeyPrompt && isApiKeyExpanded) setIsApiKeyExpanded(false)
  }, [apiKeyPrompt, isApiKeyExpanded])

  if (modelOptions.length <= 0) return null

  return (
    <React.Fragment>
      <section className={UI_RESPONSIVE_CONTROL_COMPACT_VALUE_ROW_CLASSNAME} data-kg-chat-model-control="true">
        <label htmlFor={chatModelSelectId} className="sr-only">
          {UI_COPY.chatModelSelectLabel}
        </label>
        {apiKeyPrompt ? (
          <button
            type="button"
            aria-label={isApiKeyExpanded ? 'Collapse API key input' : 'Expand API key input'}
            aria-expanded={isApiKeyExpanded}
            aria-controls={chatApiKeyInputId}
            title={`Enter ${apiKeyPrompt.credentialLabel}`}
            data-kg-chat-model-icon="true"
            data-kg-chat-api-key-toggle="true"
            data-kg-chat-model-api-key-toggle="true"
            className={[
              'App-toolbar__btn',
              UI_RESPONSIVE_CONTROL_ICON_CELL_CLASSNAME,
              uiPanelMicroLabelTextSizeClass,
              UI_THEME_TOKENS.button.text,
              UI_THEME_TOKENS.button.hoverBg,
            ].join(' ')}
            onClick={() => setIsApiKeyExpanded(prev => !prev)}
          >
            <Bot className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
            <ChevronDown
              className={[
                'size-2.5 transition-transform',
                isApiKeyExpanded ? 'rotate-180' : '',
              ].join(' ')}
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span
            aria-hidden="true"
            data-kg-chat-model-icon="true"
            className={[
              'App-toolbar__btn pointer-events-none',
              UI_RESPONSIVE_CONTROL_ICON_CELL_CLASSNAME,
              uiPanelMicroLabelTextSizeClass,
              UI_THEME_TOKENS.button.text,
            ].join(' ')}
          >
            <Bot className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
          </span>
        )}
        <PanelSelect
          id={chatModelSelectId}
          aria-label={UI_COPY.chatModelSelectLabel}
          data-kg-chat-model-select="true"
          value={modelId}
          onChange={event => {
            const next = String(event.target.value || '').trim()
            if (!next) return
            onModelChanged(next)
          }}
          disabled={disabled || modelOptions.length <= 1}
          className={`${UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME} ${UI_RESPONSIVE_COMPACT_PANEL_FIELD_INPUT_CLASSNAME} rounded border ${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.text.primary} disabled:opacity-60`}
        >
          {modelOptions.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </PanelSelect>
      </section>
      {apiKeyPrompt && isApiKeyExpanded ? (
        <section className={UI_RESPONSIVE_CONTROL_COMPACT_VALUE_ROW_CLASSNAME} data-kg-chat-api-key-prompt="true">
          <span
            aria-hidden="true"
            data-kg-chat-api-key-icon="true"
            className={[
              'App-toolbar__btn pointer-events-none',
              UI_RESPONSIVE_CONTROL_ICON_CELL_CLASSNAME,
              uiPanelMicroLabelTextSizeClass,
              UI_THEME_TOKENS.button.text,
            ].join(' ')}
          >
            <KeyRound className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <PanelTextInput
            id={chatApiKeyInputId}
            aria-label={apiKeyPrompt.credentialLabel}
            data-kg-chat-api-key-input="true"
            type="password"
            value={apiKeyPrompt.value}
            autoComplete="off"
            spellCheck={false}
            onChange={event => apiKeyPrompt.onChange(event.target.value)}
            disabled={disabled}
            placeholder={`Enter ${apiKeyPrompt.credentialLabel}`}
            className={`${UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME} ${UI_RESPONSIVE_COMPACT_PANEL_FIELD_INPUT_CLASSNAME} rounded border ${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.text.primary} disabled:opacity-60`}
          />
        </section>
      ) : null}
    </React.Fragment>
  )
}
