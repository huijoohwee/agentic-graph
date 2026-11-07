import { usePanelTypography } from '@/lib/ui/panelTypography'
import React from 'react'
import {
  KeyTypeValueHeader as SharedKeyTypeValueHeader,
  type KeyTypeValueHeaderProps,
} from 'grph-shared/react/keyTypeValueLayout'
import { KTV_DEFAULT_HEADER_LABELS } from 'grph-shared/ui/keyTypeValueRows'
import { renderKeyTypeValueMarkdownSigilBridgeNode } from '@/features/panels/ui/canvasKeyTypeValueMarkdownBridge'

export interface CanvasKeyTypeValueHeaderProps extends KeyTypeValueHeaderProps {
  useMarkdownSigilBridge?: boolean
}

export function KeyTypeValueHeader({
  keyLabel = KTV_DEFAULT_HEADER_LABELS.keyLabel,
  typeLabel = KTV_DEFAULT_HEADER_LABELS.typeLabel,
  valueLabel = KTV_DEFAULT_HEADER_LABELS.valueLabel,
  actions,
  stickyOffsetClassName = 'top-0',
  className,
  useMarkdownSigilBridge = true,
}: CanvasKeyTypeValueHeaderProps) {
  const { panelTextClass } = usePanelTypography()
  const renderedKeyLabel = renderKeyTypeValueMarkdownSigilBridgeNode(keyLabel, useMarkdownSigilBridge)
  const renderedTypeLabel = renderKeyTypeValueMarkdownSigilBridgeNode(typeLabel, useMarkdownSigilBridge)
  const renderedValueLabel = renderKeyTypeValueMarkdownSigilBridgeNode(valueLabel, useMarkdownSigilBridge)

  return (
    <SharedKeyTypeValueHeader
      keyLabel={renderedKeyLabel}
      typeLabel={renderedTypeLabel}
      valueLabel={renderedValueLabel}
      actions={actions}
      stickyOffsetClassName={stickyOffsetClassName}
      className={className}
      typographyClassName={panelTextClass}
    />
  )
}
