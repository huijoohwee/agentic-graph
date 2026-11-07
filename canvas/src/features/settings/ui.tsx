import { PanelColorPicker } from '@/lib/ui/PanelColorPicker'
import React from 'react'
import { Settings as SettingsIcon, Tag as TagIcon } from 'lucide-react'
import { ScopeIcon } from '@/features/graph-fields/ui/graphFieldIcons'
import { getIconSizeClass, getPillClass } from '@/lib/ui/icons'
import {
  UI_RESPONSIVE_BADGE_CHIP_CLASSNAME,
  UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME,
  UI_RESPONSIVE_COLOR_SWATCH_CLASSNAME,
  UI_RESPONSIVE_COLOR_SWATCH_DASHED_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME,
  UI_RESPONSIVE_PANEL_CODE_EDITOR_SMALL_FRAME_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS, UI_ICON_DEFAULTS, normalizeSingleLineControlClassName, singleLineControlDecorationClassName } from '@/lib/ui/theme-tokens'
import { PanelCheckbox, PanelTextarea, PanelTextInput, PanelSelect } from '@/lib/ui/panelFormControls'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography'
import { renderChatContextScopeSettingInput, renderChatModelSettingInput, renderChatProviderSettingInput } from '@/features/settings/chatProviderSettingInput'

export const SETTINGS_PREVIEW_INLINE_ROW_CLASS_NAME = 'flex w-full min-w-0 items-center gap-2'

const normalizePanelValueInputClassName = (className: string, alignment: 'left' | 'right' = 'right') =>
  normalizeSingleLineControlClassName(`w-full ${className.split(/\s+/).filter(token => token !== 'text-left' && token !== 'text-right').join(' ')} text-${alignment}`)

export const renderSettingInput = (
  key: string,
  type: string,
  writable: boolean,
  values: Record<string, string | number | boolean>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>>,
  dirtyRef: React.MutableRefObject<Set<string>>,
  options?: string[],
  displayValueOverride?: string | number | boolean,
) => {
  const colorKeyDefaults: Record<string, string> = {
    'three.camera.backgroundColor': '#020617',
    'three.camera.fogColor': '#1e1b4b',
    'three.graph.starfieldColor': '#facc15',
  }
  const v = typeof displayValueOverride === 'undefined' ? values[key] : displayValueOverride
  const pillBaseRaw = values.uiIconPillClass
  const pillBaseClass =
    typeof pillBaseRaw === 'string' && pillBaseRaw.trim().length > 0
      ? pillBaseRaw
      : `${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} gap-1 h-6 rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg} px-1.5`
  const badgeChipBaseRaw = values.uiIconBadgeChipClass
  const badgeChipBaseClass =
    typeof badgeChipBaseRaw === 'string' && badgeChipBaseRaw.trim().length > 0
      ? badgeChipBaseRaw
      : `${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} gap-1 h-6 ${UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME} ${UI_THEME_TOKENS.panel.bg}`
  const rawPanelInputClass = values['uiPanelKeyValueInputClass']
  const uiPanelKeyValueInputClass =
    typeof rawPanelInputClass === 'string' && rawPanelInputClass.trim().length > 0
      ? normalizePanelValueInputClassName(rawPanelInputClass)
      : normalizePanelValueInputClassName(PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass)
  const uiPanelKeyValueInputLeftClass = normalizePanelValueInputClassName(uiPanelKeyValueInputClass, 'left')
  const uiPanelKeyValueTextareaClass = `${singleLineControlDecorationClassName(uiPanelKeyValueInputClass).replace(/\btext-(left|right)\b/g, '')} px-2 py-1 text-left font-mono text-xs`
  const iconSizeClass = getIconSizeClass(values.uiIconScale === 'compact' ? 'compact' : 'default')
  const iconStrokeWidth =
    typeof values.uiIconStrokeWidth === 'number' && Number.isFinite(values.uiIconStrokeWidth)
      ? values.uiIconStrokeWidth
      : UI_ICON_DEFAULTS.strokeWidth
  const setStringValue = (keyName: string, nextValue: string) => {
    dirtyRef.current.add(keyName)
    setValues(prev => ({ ...prev, [keyName]: nextValue }))
  }
  const renderSharedTextInput = (options: {
    keyName?: string
    value: string
    className: string
    placeholder?: string
    readOnly?: boolean
    spellCheck?: boolean
    type?: React.HTMLInputTypeAttribute
    autoComplete?: string
  }) => (
    <PanelTextInput
      type={options.type}
      value={options.value}
      readOnly={options.readOnly}
      placeholder={options.placeholder}
      spellCheck={options.spellCheck}
      autoComplete={options.autoComplete}
      autoCorrect="off"
      autoCapitalize="off"
      className={options.className}
      onChange={options.keyName ? e => setStringValue(options.keyName, e.target.value) : undefined}
    />
  )
  const renderSharedTextarea = (options: {
    keyName: string
    value: string
    rows: number
    className: string
    spellCheck?: boolean
  }) => (
    <PanelTextarea
      rows={options.rows}
      value={options.value}
      spellCheck={options.spellCheck}
      autoCorrect="off"
      autoCapitalize="off"
      className={options.className}
      onChange={e => setStringValue(options.keyName, e.target.value)}
    />
  )
  if (!writable) {
    return <span className={`block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap ${UI_THEME_TOKENS.text.primary}`}>{String(v)}</span>
  }
  if (type === 'boolean') {
    return (
      <PanelCheckbox
        checked={Boolean(v)}
        onChange={e => {
          dirtyRef.current.add(key)
          setValues(prev => ({ ...prev, [key]: e.target.checked }))
        }}
      />
    )
  }
  if (key === 'payments.stripe.secretKey' || key === 'payments.stripe.webhookSecret') {
    const str = String(v || '')
    return renderSharedTextInput({
      keyName: key,
      value: str,
      className: uiPanelKeyValueInputClass,
      type: 'password',
    })
  }
  if (key === 'uiIconColorClass' || key === 'uiIconHoverBgClass') {
    const str = String(v || '')
    const placeholder = key === 'uiIconColorClass' ? UI_THEME_TOKENS.icon.color : UI_THEME_TOKENS.button.hoverBg
    const appliedClass = str.trim().length > 0 ? str : placeholder
    const previewBase =
      `${UI_RESPONSIVE_COLOR_SWATCH_CLASSNAME} border ${UI_THEME_TOKENS.input.border} rounded ${UI_THEME_TOKENS.panel.bg} text-xs`
    const previewClass =
      key === 'uiIconColorClass'
        ? `${previewBase} ${appliedClass}`
        : `${previewBase} ${UI_THEME_TOKENS.text.secondary} ${appliedClass}`
    const previewLabel = key === 'uiIconColorClass' ? 'Aa' : 'Hover'
    return (
      <section className={SETTINGS_PREVIEW_INLINE_ROW_CLASS_NAME}>
        {renderSharedTextInput({ value: previewLabel, readOnly: true, className: previewClass })}
        {renderSharedTextInput({
          keyName: key,
          value: str,
          className: `${uiPanelKeyValueInputClass} flex-1 min-w-0`,
          placeholder,
        })}
      </section>
    )
  }
  if (key === 'uiIconButtonPaddingClass') {
    const str = String(v || '')
    const placeholder = UI_THEME_TOKENS.button.padding
    const appliedClass = str.trim().length > 0 ? str : placeholder
    const previewClass = `${UI_RESPONSIVE_COLOR_SWATCH_DASHED_CLASSNAME} rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.panel.bg} text-xs ${appliedClass}`
    return (
      <section className={SETTINGS_PREVIEW_INLINE_ROW_CLASS_NAME}>
        <section className={previewClass}>
          <SettingsIcon className={iconSizeClass} strokeWidth={iconStrokeWidth} aria-hidden="true" />
        </section>
        {renderSharedTextInput({
          keyName: key,
          value: str,
          className: `${uiPanelKeyValueInputClass} flex-1 min-w-0`,
          placeholder,
        })}
      </section>
    )
  }
  if (key === 'uiIconPillClass') {
    const str = String(v || '')
    const placeholder = pillBaseClass
    const appliedClass = str.trim().length > 0 ? str : placeholder
    const previewClass = `${appliedClass} ${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} justify-center gap-1 h-6 box-border text-xs`
    return (
      <section className={SETTINGS_PREVIEW_INLINE_ROW_CLASS_NAME}>
        <section className={previewClass}>
          <TagIcon className={iconSizeClass} strokeWidth={iconStrokeWidth} aria-hidden="true" />
          <span>Scope</span>
        </section>
        {renderSharedTextInput({
          keyName: key,
          value: str,
          className: `${uiPanelKeyValueInputClass} flex-1 min-w-0`,
          placeholder: pillBaseClass,
        })}
      </section>
    )
  }
  if (key === 'uiIconPillLegendTextSizeClass' || key === 'uiIconPillBadgeTextSizeClass') {
    const str = String(v || '')
    const placeholder = 'text-xs'
    const appliedClass = str.trim().length > 0 ? str : placeholder
    const legendPreviewClass =
      key === 'uiIconPillLegendTextSizeClass'
        ? getPillClass('legend', {
            baseClass: `${pillBaseClass} box-border`,
            legendTextSizeClass: appliedClass,
            textColorClass: UI_THEME_TOKENS.text.primary,
          })
        : ''
    const badgePreviewClass =
      key === 'uiIconPillBadgeTextSizeClass'
        ? getPillClass('badge', {
            baseClass: `${pillBaseClass} box-border`,
            badgeTextSizeClass: appliedClass,
            textColorClass: UI_THEME_TOKENS.text.primary,
          })
        : ''
    return (
      <section className={SETTINGS_PREVIEW_INLINE_ROW_CLASS_NAME}>
        {key === 'uiIconPillLegendTextSizeClass' ? (
          <section className={`${uiToolbarRowScrollClassName} gap-1`}>
            <span className={legendPreviewClass}>
              <ScopeIcon scope="node" className={iconSizeClass} strokeWidth={iconStrokeWidth} aria-hidden="true" />
              <span>Base</span>
            </span>
            <span className={legendPreviewClass}>
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={iconSizeClass}
                fill="none"
                stroke="currentColor"
                strokeWidth={iconStrokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <path d="M9 12h3l2-3" />
              </svg>
              <span>Origin</span>
            </span>
            <span className={legendPreviewClass}>
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={iconSizeClass}
                fill="none"
                stroke="currentColor"
                strokeWidth={iconStrokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12c2-4 5.5-6.5 10-6.5S20 8 22 12c-2 4-5.5 6.5-10 6.5S4 16 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Visibility</span>
            </span>
          </section>
        ) : (
          <section className={`${uiToolbarRowScrollClassName} gap-1`}>
            <span className={badgePreviewClass}>
              <span>Base</span>
            </span>
          </section>
        )}
        {renderSharedTextInput({
          keyName: key,
          value: str,
          className: `${uiPanelKeyValueInputClass} flex-1 min-w-0`,
          placeholder,
        })}
      </section>
    )
  }
  if (key === 'uiIconBadgeChipClass') {
    const str = String(v || '')
    const placeholder = UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME
    const appliedClass = str.trim().length > 0 ? str : placeholder
    const previewClass = `${appliedClass} ${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} ${UI_RESPONSIVE_BADGE_CHIP_CLASSNAME} justify-center gap-1 h-6 box-border ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.text.primary} text-xs`
    return (
      <section className={SETTINGS_PREVIEW_INLINE_ROW_CLASS_NAME}>
        <section className={previewClass}>
          <TagIcon className={iconSizeClass} strokeWidth={iconStrokeWidth} aria-hidden="true" />
          <span>Badge</span>
        </section>
        {renderSharedTextInput({
          keyName: key,
          value: str,
          className: `${uiPanelKeyValueInputClass} flex-1 min-w-0`,
          placeholder,
        })}
      </section>
    )
  }
  if (key === 'uiIconBadgeChipTextSizeClass') {
    const str = String(v || '')
    const placeholder = 'text-xs'
    const appliedClass = str.trim().length > 0 ? str : placeholder
    const previewClass = `${badgeChipBaseClass} ${appliedClass} gap-1 h-6 box-border ${UI_THEME_TOKENS.text.primary}`
    return (
      <section className={SETTINGS_PREVIEW_INLINE_ROW_CLASS_NAME}>
        <section className={previewClass}>
          <TagIcon className="w-3 h-3" aria-hidden="true" />
          <span>Badge</span>
        </section>
        {renderSharedTextInput({
          keyName: key,
          value: str,
          className: `${uiPanelKeyValueInputClass} flex-1 min-w-0`,
          placeholder,
        })}
      </section>
    )
  }
  if (key in colorKeyDefaults) {
    const str = String(v || '')
    const fallback = colorKeyDefaults[key]
    const normalized = str.trim() || fallback
    return (
      <section className={SETTINGS_PREVIEW_INLINE_ROW_CLASS_NAME}>
        <PanelColorPicker

          value={normalized} aria-label={key}
          onValueChange={nextColor => {
            const next = nextColor
            dirtyRef.current.add(key)
            setValues(prev => ({ ...prev, [key]: next }))
          }}
        />
        {renderSharedTextInput({
          keyName: key,
          value: str,
          className: `${uiPanelKeyValueInputClass} flex-1 min-w-0`,
          placeholder: fallback,
        })}
      </section>
    )
  }
  if (key === 'chatAuthMode') {
    const raw = String(v ?? '').trim()
    const normalized = raw === 'byok' ? 'byok' : 'serverManaged'
    return (
      <PanelSelect
        value={normalized}
        onValueChange={selectedValueInput => {
          const selected = selectedValueInput === 'byok' ? 'byok' : 'serverManaged'
          dirtyRef.current.add(key)
          setValues(prev => {
            const next: Record<string, string | number | boolean> = { ...prev, [key]: selected }
            if (selected === 'serverManaged') {
              dirtyRef.current.add('chatApiKey')
              next.chatApiKey = ''
            }
            return next
          })
        }}
        className={uiPanelKeyValueInputClass}
      >
        <option value="serverManaged">Server-managed Key</option>
        <option value="byok">BYOK</option>
      </PanelSelect>
    )
  }
  if (key === 'maps.grabmaps.authMode') {
    const raw = String(v ?? '').trim().toLowerCase()
    const normalized = raw === 'byok' ? 'byok' : 'serverManaged'
    return (
      <PanelSelect
        value={normalized}
        onValueChange={selectedValueInput => {
          const selected = selectedValueInput === 'serverManaged' ? 'serverManaged' : 'byok'
          dirtyRef.current.add(key)
          setValues(prev => {
            const next: Record<string, string | number | boolean> = { ...prev, [key]: selected }
            if (selected === 'serverManaged') {
              dirtyRef.current.add('maps.grabmaps.apiKey')
              next['maps.grabmaps.apiKey'] = ''
            }
            return next
          })
        }}
        className={uiPanelKeyValueInputClass}
      >
        <option value="serverManaged">Server-managed Key</option>
        <option value="byok">BYOK</option>
      </PanelSelect>
    )
  }

  const chatProviderInput = renderChatProviderSettingInput({ className: uiPanelKeyValueInputClass, dirtyRef, keyName: key, options, setValues, value: v, values })
  if (chatProviderInput) return chatProviderInput

  const chatModelInput = renderChatModelSettingInput({ className: uiPanelKeyValueInputLeftClass, dirtyRef, keyName: key, options, setValues, value: v, values })
  if (chatModelInput) return chatModelInput

  const chatContextScopeInput = renderChatContextScopeSettingInput({ className: uiPanelKeyValueInputLeftClass, dirtyRef, keyName: key, setValues, value: v })
  if (chatContextScopeInput) return chatContextScopeInput

  if (key === 'chatModel') {
    const str = String(v ?? '')
    return renderSharedTextInput({
      keyName: key,
      value: str,
      className: uiPanelKeyValueInputLeftClass,
      spellCheck: false,
    })
  }

  if (type === 'string' && Array.isArray(options) && options.length > 0) {
    const raw = String(v ?? '').trim()
    const normalized = raw && options.includes(raw) ? raw : (options[0] || '')
    return (
      <PanelSelect
        value={normalized}
        onValueChange={selectedValueInput => {
          const selected = String(selectedValueInput || '').trim()
          dirtyRef.current.add(key)
          setValues(prev => ({ ...prev, [key]: selected }))
        }}
        className={uiPanelKeyValueInputClass}
      >
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </PanelSelect>
    )
  }
  if (key === 'maps.grabmaps.apiKey') {
    const authModeRaw = String(values['maps.grabmaps.authMode'] || '').trim().toLowerCase()
    const authMode = authModeRaw === 'byok' ? 'byok' : 'serverManaged'
    if (authMode !== 'byok') {
      return renderSharedTextInput({
        value: '',
        readOnly: true,
        placeholder: 'Server-managed Key',
        className: uiPanelKeyValueInputClass,
      })
    }
    const str = String(v || '')
    return renderSharedTextInput({
      keyName: key,
      value: str,
      className: uiPanelKeyValueInputClass,
      type: 'password',
      autoComplete: 'off',
      spellCheck: false,
    })
  }
  if (key === 'chatApiKey') {
    const authMode = String(values.chatAuthMode || '').trim() === 'byok' ? 'byok' : 'serverManaged'
    if (authMode !== 'byok') {
      return renderSharedTextInput({
        value: '',
        readOnly: true,
        placeholder: 'Server-managed Key',
        className: uiPanelKeyValueInputClass,
      })
    }
    const str = String(v || '')
    return renderSharedTextInput({
      keyName: key,
      value: str,
      className: uiPanelKeyValueInputClass,
      type: 'password',
      autoComplete: 'off',
      spellCheck: false,
    })
  }
  if (key === 'integrationConfigsJson') {
    const str = String(v ?? '')
    return renderSharedTextInput({
      keyName: key,
      value: str,
      className: uiPanelKeyValueInputLeftClass,
      spellCheck: false,
    })
  }
  if (key === 'chatSystemPrompt') {
    const str = String(v ?? '')
    return renderSharedTextarea({
      keyName: key,
      value: str,
      rows: 4,
      spellCheck: false,
      className: `${uiPanelKeyValueTextareaClass} ${UI_RESPONSIVE_PANEL_CODE_EDITOR_SMALL_FRAME_CLASSNAME}`,
    })
  }
  if (type === 'json') {
    const str = String(v ?? '')
    return renderSharedTextarea({
      keyName: key,
      value: str,
      rows: 6,
      spellCheck: false,
      className: `${uiPanelKeyValueTextareaClass} ${UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME}`,
    })
  }
  if (key === 'chatEndpointUrl') {
    const str = String(v ?? '')
    return renderSharedTextInput({
      keyName: key,
      value: str,
      className: uiPanelKeyValueInputLeftClass,
      spellCheck: false,
    })
  }
  if (options && options.length > 0) {
    const raw = String(v ?? '')
    const normalized = options.includes(raw) ? raw : options[0]
    return (
      <PanelSelect
        value={normalized}
        onValueChange={selectedValueInput => {
          const val = selectedValueInput
          const next = options.includes(val) ? val : options[0]
          dirtyRef.current.add(key)
          setValues(prev => ({ ...prev, [key]: next }))
        }}
        className={uiPanelKeyValueInputClass}
      >
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </PanelSelect>
    )
  }
  return (
    <PanelTextInput
      type={type === 'number' ? 'number' : 'text'}
      value={type === 'number' ? (isNaN(Number(v)) ? '' : String(Number(v))) : String(v ?? '')}
      autoCorrect="off"
      autoCapitalize="off"
      className={uiPanelKeyValueInputClass}
      onChange={e => {
        const next = e.target.value
        const val = type === 'number' ? Number(next || '0') : next
        dirtyRef.current.add(key)
        setValues(prev => ({ ...prev, [key]: val }))
      }}
    />
  )
}
