import React from 'react';
import { cn } from '@/lib/utils';
import Tooltip from '@/features/panels/ui/Tooltip';
import { useGraphStore } from '@/hooks/useGraphStore';
import {
  UI_RESPONSIVE_ICON_TEXT_ROW_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses';
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens';

type BaseButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'title' | 'aria-label' | 'children' | 'type'
>;

interface IconButtonProps extends BaseButtonProps {
  title: string;
  children: React.ReactNode;
  showTooltip?: boolean;
  tooltipContent?: string;
  ariaLabel?: string;
  suppressTitleAttribute?: boolean;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      title,
      onClick,
      onPointerDown,
      onPointerUp,
      onMouseDown,
      disabled,
      className = '',
      children,
      showTooltip = false,
      tooltipContent,
      ariaLabel,
      suppressTitleAttribute = false,
      ...buttonProps
    },
    ref,
  ) => {
    const hasMultipleChildren = React.Children.count(children) > 1;
    const content = tooltipContent ?? title;
    const uiIconColorClass = useGraphStore(state => state.uiIconColorClass);
    const uiIconHoverBgClass = useGraphStore(state => state.uiIconHoverBgClass);
    const uiIconButtonPaddingClass = useGraphStore(state => state.uiIconButtonPaddingClass);
    const uiIconFormat = useGraphStore(state => state.uiIconFormat);
    const isDisabled = !!disabled;
    const pointerActivationHandledRef = React.useRef(false);
    const isMinimal = uiIconFormat === 'minimal';
    const paddingClass =
      uiIconButtonPaddingClass && uiIconButtonPaddingClass.trim().length > 0
        ? uiIconButtonPaddingClass
        : UI_THEME_TOKENS.button.padding;
    const enabledClasses = cn(
      uiIconColorClass && uiIconColorClass.trim().length > 0 ? uiIconColorClass : UI_THEME_TOKENS.icon.color,
      isMinimal
        ? ''
        : uiIconHoverBgClass && uiIconHoverBgClass.trim().length > 0
          ? uiIconHoverBgClass
          : UI_THEME_TOKENS.button.hoverBg,
    );

    const inner = hasMultipleChildren ? (
      <span className={UI_RESPONSIVE_ICON_TEXT_ROW_CLASSNAME}>
        {children}
      </span>
    ) : (
      children
    )

    const button = (
      <button
        ref={ref}
        {...buttonProps}
        type="button"
        disabled={isDisabled}
        onPointerDown={e => {
          pointerActivationHandledRef.current = false
          if (e.button === 0) {
            try {
              e.preventDefault()
            } catch {
              void 0
            }
          }
          e.stopPropagation()
          onPointerDown?.(e)
        }}
        onPointerUp={e => {
          e.stopPropagation()
          onPointerUp?.(e)
          if (isDisabled || e.button !== 0) return
          pointerActivationHandledRef.current = true
          if (e.currentTarget instanceof HTMLElement) {
            try {
              e.currentTarget.focus({ preventScroll: true })
            } catch {
              e.currentTarget.focus()
            }
          }
          onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>)
        }}
        onMouseDown={e => {
          if (e.button === 0) {
            try {
              e.preventDefault()
            } catch {
              void 0
            }
          }
          e.stopPropagation()
          onMouseDown?.(e)
        }}
        onClick={e => {
          try {
            e.preventDefault()
          } catch {
            void 0
          }
          e.stopPropagation()
          if (pointerActivationHandledRef.current) {
            pointerActivationHandledRef.current = false
            return
          }
          if (e.currentTarget instanceof HTMLElement) {
            try {
              e.currentTarget.focus({ preventScroll: true })
            } catch {
              e.currentTarget.focus()
            }
          }
          onClick?.(e)
        }}
        className={cn(
          'kg-icon-button group relative select-none rounded justify-center',
          UI_THEME_TOKENS.button.iconControl,
          UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
          paddingClass,
          isDisabled
            ? `${UI_THEME_TOKENS.button.disabledText} cursor-not-allowed pointer-events-none`
            : enabledClasses,
          className,
        )}
        title={showTooltip || suppressTitleAttribute ? undefined : title}
        aria-label={ariaLabel ?? title}
      >
        {inner}
      </button>
    )

    if (!showTooltip) return button
    return (
      <Tooltip content={content} contentClassName={cn(UI_THEME_TOKENS.tooltip.bg, 'pointer-events-none')}>
        {button}
      </Tooltip>
    )
  }
);

export default React.memo(IconButton);
