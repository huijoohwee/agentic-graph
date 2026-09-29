import type { HTMLAttributes, ReactNode } from 'react'
import {
  KTV_DEFAULT_HEADER_LABELS,
  KTV_HEADER_LABEL_CLASS_NAME,
  KTV_FIELD_GRID_CLASS_NAME,
  KTV_ROW_LABEL_CELL_CLASS_NAME,
  KTV_ROW_VALUE_CELL_CLASS_NAME,
  KTV_SECTION_STACK_CLASS_NAME,
} from '../ui/keyTypeValueRows.js'
import { UI_THEME_TOKENS } from '../ui/themeTokens.js'

export interface KeyTypeValueHeaderProps {
  keyLabel?: ReactNode
  typeLabel?: ReactNode
  valueLabel?: ReactNode
  actions?: ReactNode
  stickyOffsetClassName?: string
  className?: string
  typographyClassName?: string
}

export interface KeyTypeValueSectionStackProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
}

export function KeyTypeValueHeader({
  keyLabel = KTV_DEFAULT_HEADER_LABELS.keyLabel,
  typeLabel = KTV_DEFAULT_HEADER_LABELS.typeLabel,
  valueLabel = KTV_DEFAULT_HEADER_LABELS.valueLabel,
  actions,
  stickyOffsetClassName = 'top-0',
  className,
  typographyClassName,
}: KeyTypeValueHeaderProps) {
  const rootClassName = [
    `sticky ${stickyOffsetClassName} z-20 border-b ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} backdrop-blur-[4px]`,
    className || '',
    typographyClassName || '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <header className={rootClassName}>
      <section className={`${KTV_FIELD_GRID_CLASS_NAME} min-h-8 items-center py-0`}>
        <section className={`${KTV_ROW_LABEL_CELL_CLASS_NAME} items-center gap-1 ${KTV_HEADER_LABEL_CLASS_NAME}`}>
          {keyLabel}
        </section>
        <section className={`${KTV_ROW_LABEL_CELL_CLASS_NAME} items-center justify-start gap-1 sm:justify-end ${KTV_HEADER_LABEL_CLASS_NAME}`}>
          {typeLabel}
        </section>
        <section className={`${KTV_ROW_VALUE_CELL_CLASS_NAME} items-center ${KTV_HEADER_LABEL_CLASS_NAME}`}>
          <section className="flex w-full min-w-0 items-center justify-start gap-1 overflow-hidden sm:justify-end">
            <span className="min-w-0 truncate">{valueLabel}</span>
            {actions ? <span className="flex shrink-0 items-center">{actions}</span> : null}
          </section>
        </section>
      </section>
    </header>
  )
}

export function KeyTypeValueSectionStack({
  children,
  className,
  ...sectionProps
}: KeyTypeValueSectionStackProps) {
  return (
    <section
      {...sectionProps}
      className={[KTV_SECTION_STACK_CLASS_NAME, className || '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </section>
  )
}
