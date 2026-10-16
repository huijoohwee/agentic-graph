import React from 'react'
import { ChevronDown } from 'lucide-react'
import { DropdownPanel } from '@/lib/ui/overlay'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { PanelCheckbox, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import {
  UI_RESPONSIVE_GRAPH_DATA_TABLE_ICON_BUTTON_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_CONTROL_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_SECONDARY_BUTTON_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export interface FilterComboboxOption<T extends string> {
  value: T
  label: string
}

export interface FilterComboboxProps<T extends string> {
  value: T
  options: ReadonlyArray<FilterComboboxOption<T>>
  onChange: (value: T) => void
  className: string
}

export function FilterCombobox<T extends string>({ value, options, onChange, className }: FilterComboboxProps<T>) {
  const [isOpen, setIsOpen] = React.useState(false)
  const buttonRef = React.useRef<HTMLButtonElement | null>(null)
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const panelTypography = usePanelTypography()

  const selectedLabel = React.useMemo(
    () => options.find(option => option.value === value)?.label ?? '',
    [options, value],
  )

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME} leading-none ${className}`}
        onClick={() => setIsOpen(open => !open)}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className={`${iconSizeClass} shrink-0 ${UI_THEME_TOKENS.icon.color}`} strokeWidth={uiIconStrokeWidth} />
      </button>
      {isOpen && (
        <DropdownPanel
          anchorRef={buttonRef}
          open={isOpen}
          onClose={() => setIsOpen(false)}
          align="bottom-left"
        >
          <menu className={`z-50 w-40 rounded-md border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-1 ${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.primary} shadow-[var(--kg-shadow-overlay)] list-none m-0`}>
            {options.map(option => (
              <button
                key={option.value}
                type="button"
                className={`w-full ${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME} rounded ${UI_THEME_TOKENS.button.hoverBg}`}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
              >
                <span className="truncate">{option.label}</span>
              </button>
            ))}
          </menu>
        </DropdownPanel>
      )}
    </>
  )
}

type GraphDataTablePanelCheckboxProps = React.InputHTMLAttributes<HTMLInputElement>

export const GraphDataTablePanelCheckbox = React.forwardRef<HTMLInputElement, GraphDataTablePanelCheckboxProps>(
  function GraphDataTablePanelCheckbox({ className, ...props }, ref) {
    return (
      <PanelCheckbox
        {...props}
        ref={ref}
        className={className}
      />
    )
  },
)

type GraphDataTablePanelSearchInputProps = React.InputHTMLAttributes<HTMLInputElement>

export const GraphDataTablePanelSearchInput = React.forwardRef<HTMLInputElement, GraphDataTablePanelSearchInputProps>(
  function GraphDataTablePanelSearchInput({ className, ...props }, ref) {
    return (
      <PanelTextInput
        {...props}
        ref={ref}
        className={className}
      />
    )
  },
)

type GraphDataTableInlineCheckboxProps = {
  checked: boolean
  onChange: (next: boolean) => void
  label: React.ReactNode
  className?: string
  checkboxClassName?: string
  labelClassName?: string
}

export function GraphDataTableInlineCheckbox({
  checked,
  onChange,
  label,
  className,
  checkboxClassName,
  labelClassName,
}: GraphDataTableInlineCheckboxProps) {
  return (
    <label className={[UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_CONTROL_CLASSNAME, className].filter(Boolean).join(' ')}>
      <GraphDataTablePanelCheckbox
        className={checkboxClassName}
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      <span className={labelClassName}>{label}</span>
    </label>
  )
}

type GraphDataTableEditableCellInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onBlur'> & {
  onCommit: (next: string) => void
}

export function GraphDataTableEditableCellInput({
  onCommit,
  className,
  ...props
}: GraphDataTableEditableCellInputProps) {
  return (
    <PanelTextInput
      {...props}
      className={className}
      onBlur={event => onCommit(event.target.value)}
    />
  )
}

export const iconButtonClassName =
  `inline-flex items-center justify-center whitespace-nowrap rounded-md border ${UI_RESPONSIVE_GRAPH_DATA_TABLE_ICON_BUTTON_CLASSNAME} ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.button.text} shadow-none ${UI_THEME_TOKENS.button.hoverBg} focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryRing} disabled:pointer-events-none disabled:opacity-50`

export const secondaryButtonClassName =
  `inline-flex items-center justify-center whitespace-nowrap font-normal transition-colors focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryRing} disabled:pointer-events-none disabled:opacity-50 ${UI_RESPONSIVE_GRAPH_DATA_TABLE_SECONDARY_BUTTON_CLASSNAME} rounded-md border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.button.text} shadow-none ${UI_THEME_TOKENS.button.hoverBg}`
