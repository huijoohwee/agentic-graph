import { SemanticSelect, type SemanticSelectProps } from '@/lib/ui/SemanticSelect'
import React from 'react'
import { usePanelTypography } from './panelTypography'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'
import { KTV_FIELD_GRID_CLASS_NAME, KTV_ROW_LABEL_CELL_CLASS_NAME, KTV_ROW_VALUE_CELL_CLASS_NAME, panelFieldDecorationClassName } from 'grph-shared/ui/keyTypeValueRows'
import { UI_THEME_TOKENS, normalizeSingleLineControlClassName } from '@/lib/ui/theme-tokens'
import {
  readDataViewControlPaddingClassName,
  readDataViewMultiLineControlClassName,
  readDataViewMultiLineControlRows,
  readDataViewSingleLineControlClassName,
  type DataViewFieldLineMode,
  type DataViewRowHeightPreset,
} from '@/lib/ui/dataViewDensity'
import { UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'

export const PANEL_FORM_LABEL_TEXT_CLASSNAME = cn('min-w-0', UI_THEME_TOKENS.text.tertiary)
export const PANEL_FORM_SECTION_LABEL_TEXT_CLASSNAME = cn('min-w-0', UI_THEME_TOKENS.text.secondary)

const PANEL_FORM_SINGLE_LINE_FILLED_CONTROL_CLASSNAME = cn(
  'w-full min-w-0 max-w-full rounded-md border',
  UI_THEME_TOKENS.input.bg,
  UI_THEME_TOKENS.input.border,
  UI_THEME_TOKENS.input.text,
)

const PANEL_FORM_MULTI_LINE_FILLED_CONTROL_CLASSNAME = cn(
  'w-full min-w-0 max-w-full resize-y rounded-md border',
  UI_THEME_TOKENS.input.bg,
  UI_THEME_TOKENS.input.border,
  UI_THEME_TOKENS.input.text,
)

const PANEL_FORM_SINGLE_LINE_TRANSPARENT_CONTROL_CLASSNAME = cn(
  'w-full min-w-0 max-w-full rounded border bg-transparent',
  UI_THEME_TOKENS.panel.border,
  UI_THEME_TOKENS.text.primary,
)

const PANEL_FORM_MULTI_LINE_TRANSPARENT_CONTROL_CLASSNAME = cn(
  'w-full min-w-0 max-w-full resize-y rounded border bg-transparent',
  UI_THEME_TOKENS.panel.border,
  UI_THEME_TOKENS.text.primary,
)

type PanelFormControlVariant = 'filled' | 'transparent'
type PanelFieldVariant = 'micro' | 'section'
type PanelFieldLayout = 'block' | 'compact'
type PanelFormDensityContextValue = {
  rowHeightPreset: DataViewRowHeightPreset
  fieldLineMode: DataViewFieldLineMode
}
type PanelReadOnlyFieldProps = {
  label: React.ReactNode
  value: React.ReactNode
  className?: string
  labelClassName?: string
  valueClassName?: string
  variant?: PanelFieldVariant
  layout?: PanelFieldLayout
}

export type PanelFieldProps = {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
  labelClassName?: string
  variant?: PanelFieldVariant
  layout?: PanelFieldLayout
}

type PanelTextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: PanelFormControlVariant
  density?: DataViewRowHeightPreset
}
type PanelTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  variant?: PanelFormControlVariant
  rowHeightPreset?: DataViewRowHeightPreset
  fieldLineMode?: DataViewFieldLineMode
}
export type PanelSelectProps = SemanticSelectProps & {
  variant?: PanelFormControlVariant
  density?: DataViewRowHeightPreset
}
type PanelCheckboxProps = React.InputHTMLAttributes<HTMLInputElement>
type PanelRangeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  variant?: PanelFormControlVariant
}

const PANEL_FORM_CHECKBOX_CLASSNAME = cn(
  `${UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME} rounded`,
  UI_THEME_TOKENS.input.border,
  UI_THEME_TOKENS.input.selectionControl,
)

const PANEL_FORM_RANGE_FILLED_CONTROL_CLASSNAME = cn(
  'w-full min-w-0 flex-1 accent-[color:var(--kg-accent)]',
  UI_THEME_TOKENS.input.selectionControl,
)

const PANEL_FORM_RANGE_TRANSPARENT_CONTROL_CLASSNAME = cn(
  'w-full min-w-0 flex-1 bg-transparent accent-[color:var(--kg-accent)]',
  UI_THEME_TOKENS.input.selectionControl,
)

const PanelFormDensityContext = React.createContext<PanelFormDensityContextValue | null>(null)

export function PanelFormDensityProvider({
  value,
  children,
}: {
  value: PanelFormDensityContextValue
  children: React.ReactNode
}) {
  return (
    <PanelFormDensityContext.Provider value={value}>
      {children}
    </PanelFormDensityContext.Provider>
  )
}

function usePanelFormDensity(): PanelFormDensityContextValue | null {
  return React.useContext(PanelFormDensityContext)
}

export const PanelTextInput = React.forwardRef<HTMLInputElement, PanelTextInputProps>(function PanelTextInput(
  { className, variant = 'filled', density, ...props },
  ref,
) {
  const { panelTextClass } = usePanelTypography()
  const densityContext = usePanelFormDensity()
  return (
    <input
      {...props}
      ref={ref}
      className={cn(
        variant === 'transparent' ? PANEL_FORM_SINGLE_LINE_TRANSPARENT_CONTROL_CLASSNAME : PANEL_FORM_SINGLE_LINE_FILLED_CONTROL_CLASSNAME,
        normalizeSingleLineControlClassName(`${readDataViewSingleLineControlClassName(density || densityContext?.rowHeightPreset || 'compact')} ${className || ''}`),
        panelTextClass,
      )}
    />
  )
})

export const PanelTextarea = React.forwardRef<HTMLTextAreaElement, PanelTextareaProps>(function PanelTextarea(
  { className, variant = 'filled', rowHeightPreset, fieldLineMode, rows, ...props },
  ref,
) {
  const { panelTextClass } = usePanelTypography()
  const densityContext = usePanelFormDensity()
  const nextRowHeightPreset = rowHeightPreset || densityContext?.rowHeightPreset || 'compact'
  const nextFieldLineMode = fieldLineMode || densityContext?.fieldLineMode || null
  const fieldLineRows = nextFieldLineMode ? readDataViewMultiLineControlRows(nextFieldLineMode) : 0
  return (
    <textarea
      {...props}
      ref={ref}
      rows={fieldLineRows > 0 ? fieldLineRows : rows}
      className={cn(
        variant === 'transparent' ? PANEL_FORM_MULTI_LINE_TRANSPARENT_CONTROL_CLASSNAME : PANEL_FORM_MULTI_LINE_FILLED_CONTROL_CLASSNAME,
        nextFieldLineMode
          ? readDataViewMultiLineControlClassName({
            rowHeightPreset: nextRowHeightPreset,
            fieldLineMode: nextFieldLineMode,
          })
          : readDataViewControlPaddingClassName(nextRowHeightPreset),
        className,
        panelTextClass,
      )}
    />
  )
})

export const PanelSelect = React.forwardRef<HTMLButtonElement, PanelSelectProps>(function PanelSelect(
  { className, variant = 'filled', density, ...props },
  ref,
) {
  const { panelTextClass } = usePanelTypography()
  const densityContext = usePanelFormDensity()
  return (
    <SemanticSelect
      {...props}
      menuTextClassName={panelTextClass}
      ref={ref}
      className={cn(
        variant === 'transparent' ? PANEL_FORM_SINGLE_LINE_TRANSPARENT_CONTROL_CLASSNAME : PANEL_FORM_SINGLE_LINE_FILLED_CONTROL_CLASSNAME,
        normalizeSingleLineControlClassName(`${readDataViewSingleLineControlClassName(density || densityContext?.rowHeightPreset || 'compact')} ${className || ''}`),
        panelTextClass,
      )}
    />
  )
})

export const PanelCheckbox = React.forwardRef<HTMLInputElement, PanelCheckboxProps>(function PanelCheckbox(
  { className, ...props },
  ref,
) {
  return <input {...props} ref={ref} type="checkbox" className={cn(PANEL_FORM_CHECKBOX_CLASSNAME, className)} />
})

export const PanelRangeInput = React.forwardRef<HTMLInputElement, PanelRangeInputProps>(function PanelRangeInput(
  { className, variant = 'filled', ...props },
  ref,
) {
  return (
    <input
      {...props}
      ref={ref}
      type="range"
      className={cn(
        variant === 'transparent' ? PANEL_FORM_RANGE_TRANSPARENT_CONTROL_CLASSNAME : PANEL_FORM_RANGE_FILLED_CONTROL_CLASSNAME,
        className,
      )}
    />
  )
})

// variant/layout are accepted for older callers only; there is one field presentation.
export function PanelField({ label, children, className, labelClassName }: PanelFieldProps) {
  const row = useCanvasKeyTypeValueStaticRowProps()
  return (
    <label data-panel-field-row="true" className={cn(
      panelFieldDecorationClassName(className), KTV_FIELD_GRID_CLASS_NAME,
      'col-span-full items-center', row.fontClassName, row.textSizeClassName, row.densityClassName,
    )}>
      <span className={cn(KTV_ROW_LABEL_CELL_CLASS_NAME, panelFieldDecorationClassName(labelClassName))}>{label}</span>
      <span />
      <span className={cn(KTV_ROW_VALUE_CELL_CLASS_NAME, 'items-center')}>{children}</span>
    </label>
  )
}

export function PanelReadOnlyField({ label, value, className, labelClassName, valueClassName }: PanelReadOnlyFieldProps) {
  const row = useCanvasKeyTypeValueStaticRowProps()
  return <KeyTypeValueStaticRow {...row}
    className={cn('col-span-full', panelFieldDecorationClassName(className))}
    keyNode={<span className={panelFieldDecorationClassName(labelClassName)}>{label}</span>}
    valueNode={<span className={panelFieldDecorationClassName(valueClassName)}>{value}</span>}
  />
}

export function readPanelChoiceSurfaceClassName(options: {
  active: boolean
  multiline?: boolean
  className?: string
}): string {
  const { active, multiline = false, className } = options
  return cn(
    multiline ? 'block min-h-14 w-full rounded-md border px-2 py-1 text-left text-inherit' : 'block w-full rounded-md border px-2 py-1 text-left text-inherit',
    active
      ? `${UI_THEME_TOKENS.button.activeBorder} ${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
      : `${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.text}`,
    className,
  )
}

export function readPanelBooleanChoiceButtonClassName(options: {
  active: boolean
  className?: string
}): string {
  const { active, className } = options
  return cn(
    'App-toolbar__btn border',
    UI_THEME_TOKENS.input.border,
    active
      ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
      : `${UI_THEME_TOKENS.panel.headerBg} ${UI_THEME_TOKENS.text.primary}`,
    className,
  )
}
