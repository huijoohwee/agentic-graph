import React from 'react'
import { cn } from '@/lib/utils'
import { UI_FOCUS_RING } from '@/lib/ui/focusRing'
import {
  UI_RESPONSIVE_ACTION_ROW_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_ACTION_DEFAULT_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_ACTION_SMALL_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_DEFAULT_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export type DataViewToolbarButtonVariant = 'default' | 'primary' | 'ghost'
export type DataViewToolbarButtonSize = 'sm' | 'md'

export type DataViewToolbarButtonProps = {
  label: string
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  ariaLabel?: string
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
  variant?: DataViewToolbarButtonVariant
  size?: DataViewToolbarButtonSize
  className?: string
}

export type DataViewToolbarClassNameOptions = {
  disabled?: boolean
  variant?: DataViewToolbarButtonVariant
  size?: DataViewToolbarButtonSize
  className?: string
}

const readDataViewActionSizeClassName = (size: DataViewToolbarButtonSize): string =>
  size === 'sm' ? UI_RESPONSIVE_DATA_VIEW_ACTION_SMALL_CLASSNAME : UI_RESPONSIVE_DATA_VIEW_ACTION_DEFAULT_CLASSNAME

const readDataViewIconActionSizeClassName = (size: DataViewToolbarButtonSize): string =>
  size === 'sm' ? UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME : UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_DEFAULT_CLASSNAME

const readDataViewToolbarVariantClassName = (variant: DataViewToolbarButtonVariant): string =>
  variant === 'primary'
    ? cn(UI_THEME_TOKENS.button.selectedIcon, UI_THEME_TOKENS.button.activeBorder)
    : variant === 'ghost'
      ? cn('border-transparent', UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.text.secondary)
      : cn(UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)

export function getDataViewToolbarButtonClassName(options: DataViewToolbarClassNameOptions = {}): string {
  const variant = options.variant ?? 'default'
  const size = options.size ?? 'md'

  return cn(
    UI_RESPONSIVE_ACTION_ROW_CLASSNAME,
    readDataViewActionSizeClassName(size),
    'justify-center select-none rounded text-xs',
    UI_THEME_TOKENS.border.width,
    UI_FOCUS_RING,
    readDataViewToolbarVariantClassName(variant),
    options.disabled ? 'opacity-50 pointer-events-none' : undefined,
    options.className,
  )
}

export function DataViewToolbarButton(props: DataViewToolbarButtonProps) {
  const variant = props.variant ?? 'default'
  const size = props.size ?? 'md'

  return (
    <button
      type="button"
      className={getDataViewToolbarButtonClassName({
        disabled: props.disabled,
        variant,
        size,
        className: props.className,
      })}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.ariaLabel ?? props.label}
    >
      {props.leadingIcon ? <span className={UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} aria-hidden="true">{props.leadingIcon}</span> : null}
      <span className="font-medium truncate">{props.label}</span>
      {props.trailingIcon ? <span className={UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} aria-hidden="true">{props.trailingIcon}</span> : null}
    </button>
  )
}

export type DataViewIconButtonProps = {
  ariaLabel: string
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  icon: React.ReactNode
  className?: string
  size?: DataViewToolbarButtonSize
  variant?: DataViewToolbarButtonVariant
}

export type DataViewIconClassNameOptions = DataViewToolbarClassNameOptions

export function getDataViewIconButtonClassName(options: DataViewIconClassNameOptions = {}): string {
  const variant = options.variant ?? 'ghost'
  const size = options.size ?? 'md'

  return cn(
    UI_RESPONSIVE_ACTION_ROW_CLASSNAME,
    readDataViewIconActionSizeClassName(size),
    'justify-center',
    UI_THEME_TOKENS.button.iconControl,
    variant === 'primary' ? UI_THEME_TOKENS.button.selectedIcon : readDataViewToolbarVariantClassName(variant),
    options.disabled ? 'opacity-50 pointer-events-none' : undefined,
    options.className,
  )
}

export function DataViewIconButton(props: DataViewIconButtonProps) {
  return (
    <button
      type="button"
      className={getDataViewIconButtonClassName({
        disabled: props.disabled,
        variant: props.variant,
        size: props.size,
        className: props.className,
      })}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
    >
      <span className={UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} aria-hidden="true">
        {props.icon}
      </span>
    </button>
  )
}
