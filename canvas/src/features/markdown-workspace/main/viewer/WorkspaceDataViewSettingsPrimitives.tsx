import type { PanelSelectProps } from '@/lib/ui/panelFormControls'
import React from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { PanelCheckbox, PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_SETTINGS_LAYOUT_CHOICE_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_SETTINGS_ROW_VALUE_CLASSNAME,
  UI_RESPONSIVE_MENU_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export type SettingsRowProps = {
  icon: React.ReactNode
  label: string
  value?: string
  onClick?: () => void
}

export function SettingsRow(props: SettingsRowProps) {
  return (
    <button
      type="button"
      className={[UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'gap-3 px-3 py-2 rounded', UI_THEME_TOKENS.button.hoverBg].join(' ')}
      onClick={props.onClick}
    >
      <span className={['w-5 h-5 shrink-0 flex items-center justify-center', UI_THEME_TOKENS.icon.color].join(' ')}>{props.icon}</span>
      <span className={['min-w-0 text-sm', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}>{props.label}</span>
      <span className={[UI_RESPONSIVE_DATA_VIEW_SETTINGS_ROW_VALUE_CLASSNAME, 'ml-auto min-w-0 text-sm', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')}>{props.value || ''}</span>
      <ChevronRight className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
    </button>
  )
}

export function LayoutChoice(props: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        UI_RESPONSIVE_DATA_VIEW_SETTINGS_LAYOUT_CHOICE_CLASSNAME,
        'relative flex-1 rounded border px-3 py-2 flex flex-col items-center justify-center gap-1 overflow-hidden',
        props.active
          ? cn(UI_THEME_TOKENS.button.activeBorder, UI_THEME_TOKENS.button.activeBg)
          : cn(UI_THEME_TOKENS.panel.border),
        UI_THEME_TOKENS.button.hoverBg,
      )}
      onClick={props.onClick}
    >
      {props.active ? (
        <span className="absolute right-2 top-2">
          <Check className={cn(UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, UI_THEME_TOKENS.button.activeText)} aria-hidden="true" />
        </span>
      ) : null}
      <span className={props.active ? UI_THEME_TOKENS.button.activeText : UI_THEME_TOKENS.text.secondary}>{props.icon}</span>
      <span className={cn('max-w-full text-sm font-medium', UI_TEXT_TRUNCATE, props.active ? UI_THEME_TOKENS.button.activeText : UI_THEME_TOKENS.text.secondary)}>{props.label}</span>
    </button>
  )
}

type WorkspaceDataViewComfortableTextInputProps = React.InputHTMLAttributes<HTMLInputElement>

export const WorkspaceDataViewComfortableTextInput = React.forwardRef<HTMLInputElement, WorkspaceDataViewComfortableTextInputProps>(
  function WorkspaceDataViewComfortableTextInput({ className, ...props }, ref) {
    return (
      <PanelTextInput
        {...props}
        ref={ref}
        className={cn(
          UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME,
          'rounded border text-sm',
          UI_THEME_TOKENS.input.bg,
          UI_THEME_TOKENS.input.border,
          UI_THEME_TOKENS.input.text,
          className,
        )}
      />
    )
  },
)

type WorkspaceDataViewSearchInputProps = React.InputHTMLAttributes<HTMLInputElement>

export const WorkspaceDataViewSearchInput = React.forwardRef<HTMLInputElement, WorkspaceDataViewSearchInputProps>(
  function WorkspaceDataViewSearchInput({ className, ...props }, ref) {
    return (
      <PanelTextInput
        {...props}
        ref={ref}
        variant="transparent"
        className={cn(
          UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME,
          'min-w-0 flex-1 bg-transparent text-xs outline-none',
          UI_THEME_TOKENS.input.text,
          className,
        )}
      />
    )
  },
)

type WorkspaceDataViewFieldSelectProps = PanelSelectProps

export const WorkspaceDataViewFieldSelect = React.forwardRef<HTMLButtonElement, WorkspaceDataViewFieldSelectProps>(
  function WorkspaceDataViewFieldSelect({ className, ...props }, ref) {
    return (
      <PanelSelect
        {...props}
        ref={ref}
        className={cn(className)}
      />
    )
  },
)

type WorkspaceDataViewCompactCheckboxProps = React.InputHTMLAttributes<HTMLInputElement>

export const WorkspaceDataViewCompactCheckbox = React.forwardRef<HTMLInputElement, WorkspaceDataViewCompactCheckboxProps>(
  function WorkspaceDataViewCompactCheckbox({ className, ...props }, ref) {
    return (
      <PanelCheckbox
        {...props}
        ref={ref}
        className={cn(UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME, className)}
      />
    )
  },
)
