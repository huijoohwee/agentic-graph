import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

export const RESIZE_SEPARATOR_THICKNESS = 'var(--kg-resize-separator-thickness, 0.25rem)'

export type VerticalResizeSeparatorHrProps = Omit<
  React.ComponentPropsWithoutRef<'hr'>,
  'role' | 'aria-orientation' | 'aria-label'
> & {
  ariaLabel: string
  visualStyle?: 'line' | 'centerGrip'
}

export const VerticalResizeSeparatorHr = React.forwardRef<HTMLHRElement, VerticalResizeSeparatorHrProps>(
  ({ ariaLabel, className, style, visualStyle = 'line', ...rest }, ref) => {
    return (
      <hr
        ref={ref}
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={ariaLabel}
        className={cn(
          `kg-resize-separator h-full border-0 cursor-col-resize select-none touch-none focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryStrongRing}`,
          className,
        )}
        style={{
          inlineSize: RESIZE_SEPARATOR_THICKNESS,
          minWidth: RESIZE_SEPARATOR_THICKNESS,
          ...({ '--kg-resize-line-length': visualStyle === 'centerGrip' ? '3.5rem' : '100%' } as React.CSSProperties),
          ...style,
        }}
        {...rest}
      />
    )
  },
)

VerticalResizeSeparatorHr.displayName = 'VerticalResizeSeparatorHr'

export type HorizontalResizeSeparatorHrProps = Omit<
  React.ComponentPropsWithoutRef<'hr'>,
  'role' | 'aria-orientation' | 'aria-label'
> & {
  ariaLabel: string
  visualStyle?: 'line' | 'centerGrip'
}

export const HorizontalResizeSeparatorHr = React.forwardRef<HTMLHRElement, HorizontalResizeSeparatorHrProps>(
  ({ ariaLabel, className, style, visualStyle = 'line', ...rest }, ref) => {
    return (
      <hr
        ref={ref}
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label={ariaLabel}
        className={cn(
          `kg-resize-separator w-full border-0 cursor-row-resize select-none touch-none focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryStrongRing}`,
          className,
        )}
        style={{
          blockSize: RESIZE_SEPARATOR_THICKNESS,
          minHeight: RESIZE_SEPARATOR_THICKNESS,
          ...({ '--kg-resize-line-length': visualStyle === 'centerGrip' ? '3.5rem' : '100%' } as React.CSSProperties),
          ...style,
        }}
        {...rest}
      />
    )
  },
)

HorizontalResizeSeparatorHr.displayName = 'HorizontalResizeSeparatorHr'
