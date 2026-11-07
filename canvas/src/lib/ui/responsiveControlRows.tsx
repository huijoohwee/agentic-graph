import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import React from 'react'
import { CanvasKeyTypeValueStaticRow } from '@/features/panels/ui/canvasKeyTypeValueStaticRow'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  UI_RESPONSIVE_CONTROL_INPUT_CLASSNAME,
  UI_RESPONSIVE_CONTROL_TOGGLE_BUTTON_CLASSNAME,
  UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_CLASSNAME,
  UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_END_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

type ControlRowAlign = 'center' | 'start'

export type ResponsiveControlRowProps = {
  label: React.ReactNode
  children: React.ReactNode
  compact?: boolean
  align?: ControlRowAlign
  labelClassName?: string
  rowClassName?: string
  valueClassName?: string
}

export type ResponsiveNumberRowProps = {
  label: React.ReactNode
  value: number
  min: number
  max: number
  step?: number
  compact?: boolean
  disabled?: boolean
  onChange: (next: number) => void
}

export type ResponsiveSelectRowProps = {
  label: React.ReactNode
  value: string
  options?: readonly string[]
  optionLabels?: Record<string, string>
  children?: React.ReactNode
  compact?: boolean
  disabled?: boolean
  onChange: (next: string) => void
}

export type ResponsiveToggleRowProps = {
  label: React.ReactNode
  value: boolean
  compact?: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}

export type ResponsiveControlInputProps = React.InputHTMLAttributes<HTMLInputElement>

export function ResponsiveControlRow({
  label,
  children,
  compact,
  align = 'center',
  labelClassName,
  rowClassName,
  valueClassName,
}: ResponsiveControlRowProps) {
  const labelId = React.useId()
  return (
    <CanvasKeyTypeValueStaticRow
      align={align}
      density={compact ? 'compact' : 'default'}
      className={rowClassName}
      keyNode={<label id={labelId} className={labelClassName}>{label}</label>}
      valueNode={
        <section className={`w-full min-w-0 ${valueClassName || ''}`}>
          {React.Children.map(children, child => {
            if (!React.isValidElement<Record<string, unknown>>(child) || child.props['aria-label'] || child.props['aria-labelledby']) return child
            const isField = child.type === PanelSelect || child.type === ResponsiveControlInput || child.type === 'input' || child.type === 'select'
            return isField ? React.cloneElement(child, { 'aria-labelledby': labelId }) : child
          })}
        </section>
      }
    />
  )
}

export function ResponsiveControlInput({
  className,
  ...inputProps
}: ResponsiveControlInputProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || 'text-xs')
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || '')

  return (
    <PanelTextInput
      {...inputProps}
      className={`${uiPanelTextFontClass} ${uiPanelKeyValueTextSizeClass} ${UI_RESPONSIVE_CONTROL_INPUT_CLASSNAME} ${className || ''}`}
    />
  )
}

export function ResponsiveNumberRow({
  label,
  value,
  min,
  max,
  step,
  compact,
  disabled,
  onChange,
}: ResponsiveNumberRowProps) {
  return (
    <ResponsiveControlRow label={label} compact={compact}>
      <ResponsiveControlInput
        type="number"
        min={min}
        max={max}
        step={typeof step === 'number' ? step : 1}
        value={value}
        disabled={disabled}
        onChange={e => {
          const raw = Number.parseFloat(e.target.value)
          if (!Number.isFinite(raw)) return
          onChange(Math.max(min, Math.min(max, raw)))
        }}
        className="text-right"
      />
    </ResponsiveControlRow>
  )
}

export function ResponsiveSelectRow({
  label,
  value,
  options,
  optionLabels,
  children,
  compact,
  disabled,
  onChange,
}: ResponsiveSelectRowProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || 'text-xs')
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || '')

  return (
    <ResponsiveControlRow label={label} compact={compact}>
      <PanelSelect
        className={`${UI_THEME_TOKENS.border.outline} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.text.primary} ${uiPanelTextFontClass} ${uiPanelKeyValueTextSizeClass}`}
        value={value}
        disabled={disabled}
        onValueChange={selectedValueInput => onChange(String(selectedValueInput || ''))}
      >
        {children || options?.map(option => (
          <option key={option} value={option}>
            {optionLabels?.[option] || option}
          </option>
        ))}
      </PanelSelect>
    </ResponsiveControlRow>
  )
}

export function ResponsiveToggleRow({
  label,
  value,
  compact,
  disabled,
  onChange,
}: ResponsiveToggleRowProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || 'text-xs')
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || '')
  const toggleGroupClassName = compact ? UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_CLASSNAME : UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_END_CLASSNAME

  return (
    <ResponsiveControlRow
      label={label}
      compact={compact}
      valueClassName={toggleGroupClassName}
    >
      <button
        type="button"
        disabled={disabled}
        className={`${UI_RESPONSIVE_CONTROL_TOGGLE_BUTTON_CLASSNAME} ${uiPanelTextFontClass} ${uiPanelKeyValueTextSizeClass} border ${UI_THEME_TOKENS.input.border} ${!value ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}` : `${UI_THEME_TOKENS.panel.headerBg} ${UI_THEME_TOKENS.text.primary}`}`}
        onClick={() => onChange(false)}
      >
        Off
      </button>
      <button
        type="button"
        disabled={disabled}
        className={`${UI_RESPONSIVE_CONTROL_TOGGLE_BUTTON_CLASSNAME} ${uiPanelTextFontClass} ${uiPanelKeyValueTextSizeClass} border ${UI_THEME_TOKENS.input.border} ${value ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}` : `${UI_THEME_TOKENS.panel.headerBg} ${UI_THEME_TOKENS.text.primary}`}`}
        onClick={() => onChange(true)}
      >
        On
      </button>
    </ResponsiveControlRow>
  )
}
