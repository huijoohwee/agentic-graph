import { KeyTypeValueRow } from 'agentic-design-system/react/ktv'
import type { HTMLAttributes, ReactNode } from 'react'
import {
  KTV_DEFAULT_HEADER_LABELS,
  KTV_HEADER_LABEL_CLASS_NAME,
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
      <KeyTypeValueRow keyNode={keyLabel} typeNode={typeLabel}
        keyClassName={KTV_HEADER_LABEL_CLASS_NAME} typeClassName={KTV_HEADER_LABEL_CLASS_NAME} valueClassName={KTV_HEADER_LABEL_CLASS_NAME}
        valueNode={<section className="flex w-full min-w-0 items-center justify-start gap-1 overflow-hidden sm:justify-end">
          <span className="min-w-0 truncate">{valueLabel}</span>
          {actions ? <span className="flex shrink-0 items-center">{actions}</span> : null}
        </section>} />
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
