import type { PanelSelectProps } from '@/lib/ui/panelFormControls'
import React from 'react'

import { PanelCheckbox, PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import {
  UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_COMFORTABLE_FIELD_INPUT_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_SHORT_FIELD_INPUT_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

type GraphFieldsShortTextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  textSizeClassName?: string
}

export const GraphFieldsShortTextInput = React.forwardRef<HTMLInputElement, GraphFieldsShortTextInputProps>(
  function GraphFieldsShortTextInput({ className, textSizeClassName, ...props }, ref) {
    return (
      <PanelTextInput
        {...props}
        ref={ref}
        className={cn(
          UI_RESPONSIVE_GRAPH_FIELDS_SHORT_FIELD_INPUT_CLASSNAME,
          'rounded border',
          UI_THEME_TOKENS.input.border,
          UI_THEME_TOKENS.input.bg,
          UI_THEME_TOKENS.input.text,
          UI_THEME_TOKENS.focus.primaryBorderRing,
          textSizeClassName,
          className,
        )}
      />
    )
  },
)

type GraphFieldsInlineTextInputProps = React.InputHTMLAttributes<HTMLInputElement>

export const GraphFieldsInlineTextInput = React.forwardRef<HTMLInputElement, GraphFieldsInlineTextInputProps>(
  function GraphFieldsInlineTextInput({ className, ...props }, ref) {
    return (
      <PanelTextInput
        {...props}
        ref={ref}
        variant="transparent"
        className={cn(
          UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_CLASSNAME,
          'bg-transparent text-xs outline-none',
          UI_THEME_TOKENS.input.text,
          className,
        )}
      />
    )
  },
)

type GraphFieldsFieldTextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  textSizeClassName?: string
}

export const GraphFieldsFieldTextInput = React.forwardRef<HTMLInputElement, GraphFieldsFieldTextInputProps>(
  function GraphFieldsFieldTextInput({ className, textSizeClassName, ...props }, ref) {
    return (
      <PanelTextInput
        {...props}
        ref={ref}
        className={cn(
          UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME,
          'rounded border',
          UI_THEME_TOKENS.input.border,
          UI_THEME_TOKENS.input.bg,
          UI_THEME_TOKENS.input.text,
          UI_THEME_TOKENS.focus.primaryBorderRing,
          textSizeClassName,
          className,
        )}
      />
    )
  },
)

type GraphFieldsComfortableTextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  textSizeClassName?: string
}

export const GraphFieldsComfortableTextInput = React.forwardRef<HTMLInputElement, GraphFieldsComfortableTextInputProps>(
  function GraphFieldsComfortableTextInput({ className, textSizeClassName, ...props }, ref) {
    return (
      <PanelTextInput
        {...props}
        ref={ref}
        className={cn(
          UI_RESPONSIVE_GRAPH_FIELDS_COMFORTABLE_FIELD_INPUT_CLASSNAME,
          'rounded border',
          UI_THEME_TOKENS.input.border,
          UI_THEME_TOKENS.input.bg,
          UI_THEME_TOKENS.input.text,
          UI_THEME_TOKENS.focus.primaryBorderRing,
          textSizeClassName,
          className,
        )}
      />
    )
  },
)

type GraphFieldsFieldSelectProps = PanelSelectProps & {
  textSizeClassName?: string
}

export const GraphFieldsFieldSelect = React.forwardRef<HTMLButtonElement, GraphFieldsFieldSelectProps>(
  function GraphFieldsFieldSelect({ className, textSizeClassName, ...props }, ref) {
    return (
      <PanelSelect
        {...props}
        ref={ref}
        className={cn(
          UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME,
          'rounded border',
          UI_THEME_TOKENS.input.border,
          UI_THEME_TOKENS.input.bg,
          UI_THEME_TOKENS.input.text,
          UI_THEME_TOKENS.focus.primaryBorderRing,
          textSizeClassName,
          className,
        )}
      />
    )
  },
)

type GraphFieldsComfortableFieldSelectProps = PanelSelectProps & {
  textSizeClassName?: string
}

export const GraphFieldsComfortableFieldSelect = React.forwardRef<HTMLButtonElement, GraphFieldsComfortableFieldSelectProps>(
  function GraphFieldsComfortableFieldSelect({ className, textSizeClassName, ...props }, ref) {
    return (
      <PanelSelect
        {...props}
        ref={ref}
        className={cn(
          UI_RESPONSIVE_GRAPH_FIELDS_COMFORTABLE_FIELD_INPUT_CLASSNAME,
          'rounded border',
          UI_THEME_TOKENS.input.border,
          UI_THEME_TOKENS.input.bg,
          UI_THEME_TOKENS.input.text,
          UI_THEME_TOKENS.focus.primaryBorderRing,
          textSizeClassName,
          className,
        )}
      />
    )
  },
)

type GraphFieldsCompactCheckboxProps = React.InputHTMLAttributes<HTMLInputElement>

export const GraphFieldsCompactCheckbox = React.forwardRef<HTMLInputElement, GraphFieldsCompactCheckboxProps>(
  function GraphFieldsCompactCheckbox({ className, ...props }, ref) {
    return (
      <PanelCheckbox
        {...props}
        ref={ref}
        className={cn(
          UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME,
          'rounded',
          UI_THEME_TOKENS.input.border,
          UI_THEME_TOKENS.input.selectionControl,
          className,
        )}
      />
    )
  },
)
