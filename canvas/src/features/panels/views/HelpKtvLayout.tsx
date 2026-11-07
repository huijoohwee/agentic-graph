import React from 'react'
import { PanelCaption, PanelCode } from '@/features/panels/ui/PanelText'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import {
  KeyTypeValueStaticRow,
  RightAlignedValueCell,
} from 'grph-shared/react/keyTypeValueRow'
import {
  MainPanelTypeIcon,
  type MainPanelTypeIconKey,
} from '@/features/panels/ui/mainPanelHelpIconLibrary'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { getUiSectionChipClassName } from '@/lib/ui/sectionChipChrome'
import { UI_RESPONSIVE_BADGE_CHIP_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

interface HelpKtvTypeIconProps {
  iconKey: MainPanelTypeIconKey
  className?: string
}

interface HelpKtvRowProps {
  keyNode: React.ReactNode
  iconKey?: MainPanelTypeIconKey
  typeNode?: React.ReactNode
  valueNode: React.ReactNode
  align?: 'center' | 'start'
  density?: 'default' | 'compact'
  className?: string
  id?: string
  dataKgAnchor?: string
}

export function HelpKtvTypeIcon({ iconKey, className }: HelpKtvTypeIconProps) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)

  return (
    <MainPanelTypeIcon
      iconKey={iconKey}
      className={[iconSizeClass, UI_THEME_TOKENS.text.secondary, className || '']
        .filter(Boolean)
        .join(' ')}
      strokeWidth={uiIconStrokeWidth}
    />
  )
}

export function HelpKtvRow({
  keyNode,
  iconKey,
  typeNode,
  valueNode,
  align = 'start',
  density = 'default',
  className,
  id,
  dataKgAnchor,
}: HelpKtvRowProps) {
  const rowProps = useCanvasKeyTypeValueStaticRowProps(density)
  const resolvedTypeNode = typeNode ?? (iconKey ? <HelpKtvTypeIcon iconKey={iconKey} /> : null)

  return (
    <KeyTypeValueStaticRow
      {...rowProps}
      keyNode={keyNode}
      typeNode={resolvedTypeNode}
      valueNode={(
        <RightAlignedValueCell>
          {valueNode}
        </RightAlignedValueCell>
      )}
      align={align}
      className={className}
      id={id}
      dataKgAnchor={dataKgAnchor}
    />
  )
}

export function HelpKtvRows({
  children,
  className,
  ...divProps
}: React.HTMLAttributes<HTMLElement> & {
  children: React.ReactNode
}) {
  return (
    <section
      {...divProps}
      className={['space-y-0.5', className || ''].filter(Boolean).join(' ')}
    >
      {children}
    </section>
  )
}

export function HelpKtvValueStack({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={[
        'flex min-w-0 max-w-full flex-col items-start gap-0.5 text-left sm:items-end sm:text-right',
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </section>
  )
}

export function HelpKtvInlineGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={[
        'inline-flex min-w-0 max-w-full flex-wrap items-center justify-start gap-1 sm:justify-end',
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  )
}

export function HelpKtvPill({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={[
        getUiSectionChipClassName('secondary'),
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  )
}

export function HelpKtvCode({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <PanelCode
      {...props}
      className={[
        `max-w-full break-all ${UI_RESPONSIVE_BADGE_CHIP_CLASSNAME} rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.text.primary}`,
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </PanelCode>
  )
}

export function HelpKtvMutedText({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <PanelCaption className={[UI_THEME_TOKENS.text.secondary, className || ''].filter(Boolean).join(' ')}>
      {children}
    </PanelCaption>
  )
}

export function HelpKtvActionGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={[
        'inline-flex min-w-0 max-w-full flex-wrap items-center justify-start gap-1 sm:justify-end',
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  )
}
