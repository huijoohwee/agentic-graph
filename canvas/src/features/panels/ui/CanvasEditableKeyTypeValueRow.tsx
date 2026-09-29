import { renderMainPanelRowHelp } from './mainPanelRowHelp'
import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { renderKeyTypeValueMarkdownSigilBridgeNode } from '@/features/panels/ui/canvasKeyTypeValueMarkdownBridge'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import type { KeyTypeValueRowProps } from '@/features/panels/ui/canvasKeyTypeValueStaticRow'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'

export type CanvasEditableKeyTypeValueRowProps = KeyTypeValueRowProps

export function CanvasEditableKeyTypeValueRow({
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
}: CanvasEditableKeyTypeValueRowProps) {
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps(density)

  return (
    <KeyTypeValueStaticRow
      id={id}
      data-kg-anchor={dataKgAnchor}
      keyNode={renderMainPanelRowHelp(renderKeyTypeValueMarkdownSigilBridgeNode(keyNode, useMarkdownSigilBridge), help, 'key')}
      typeNode={renderKeyTypeValueMarkdownSigilBridgeNode(typeNode, useMarkdownSigilBridge)}
      valueNode={renderMainPanelRowHelp(renderKeyTypeValueMarkdownSigilBridgeNode(valueNode, useMarkdownSigilBridge), help, 'value')}
      align={align}
      layout={layout}
      onClick={onClick}
      className={className}
      {...staticRowProps}
      activeClassName={isActive ? UI_THEME_TOKENS.table.rowSelected : staticRowProps.activeClassName}
    />
  )
}
