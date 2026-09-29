import { renderMainPanelRowHelp, type MainPanelFieldHelp } from './mainPanelRowHelp'
import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { renderKeyTypeValueMarkdownSigilBridgeNode } from '@/features/panels/ui/canvasKeyTypeValueMarkdownBridge'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { KeyTypeValueStaticRow as SharedKeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'

export interface KeyTypeValueRowProps {
  help?: MainPanelFieldHelp
  keyNode: React.ReactNode
  typeNode?: React.ReactNode
  valueNode: React.ReactNode
  align?: 'center' | 'start'
  density?: 'default' | 'compact'
  layout?: 'keyTypeValue' | 'keyValue' | 'keyIconValue' | 'keyIconSliderInput'
  onClick?: () => void
  className?: string
  id?: string
  dataKgAnchor?: string
  isActive?: boolean
  useMarkdownSigilBridge?: boolean
}

export type CanvasKeyTypeValueStaticRowProps = KeyTypeValueRowProps

export function CanvasKeyTypeValueStaticRow({
  keyNode,
  help,
  typeNode,
  valueNode,
  align,
  density = 'default',
  layout = 'keyTypeValue',
  onClick,
  className,
  id,
  dataKgAnchor,
  isActive,
  useMarkdownSigilBridge = true,
}: CanvasKeyTypeValueStaticRowProps) {
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps(density)
  const activeClassName = isActive
    ? UI_THEME_TOKENS.table.rowSelected
    : UI_THEME_TOKENS.table.rowHoverHighlight

  return (
    <SharedKeyTypeValueStaticRow
      id={id}
      data-kg-anchor={dataKgAnchor}
      keyNode={renderMainPanelRowHelp(renderKeyTypeValueMarkdownSigilBridgeNode(keyNode, useMarkdownSigilBridge), help, 'key')}
      typeNode={renderKeyTypeValueMarkdownSigilBridgeNode(typeNode, useMarkdownSigilBridge)}
      valueNode={renderMainPanelRowHelp(renderKeyTypeValueMarkdownSigilBridgeNode(valueNode, useMarkdownSigilBridge), help, 'value')}
      align={align}
      layout={layout}
      {...staticRowProps}
      activeClassName={activeClassName}
      onClick={onClick}
      className={className}
    />
  )
}
