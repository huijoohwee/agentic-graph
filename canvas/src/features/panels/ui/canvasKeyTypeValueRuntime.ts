import React from 'react'
import type { KeyTypeValueStaticRowProps } from 'grph-shared/react/keyTypeValueRow'
import { prepareMainPanelRowHelp, type MainPanelFieldHelp } from './mainPanelRowHelp'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'

export interface CanvasKeyTypeValueRuntime {
  uiPanelKeyValueTextSizeClass: string
  uiPanelTextFontClass: string
  uiPanelRowDensityDefaultClass: string
  uiPanelRowDensityCompactClass: string
}

export interface CanvasKeyTypeValueStaticRowSharedProps {
  presentCells: NonNullable<KeyTypeValueStaticRowProps['presentCells']>
  textSizeClassName: string
  fontClassName: string
  densityClassName: string
  activeClassName: string
}

export const resolveCanvasKeyTypeValueDensityClassName = (
  runtime: CanvasKeyTypeValueRuntime,
  density: 'default' | 'compact' = 'default',
): string =>
  density === 'compact'
    ? runtime.uiPanelRowDensityCompactClass
    : runtime.uiPanelRowDensityDefaultClass

export function useCanvasKeyTypeValueRuntime(): CanvasKeyTypeValueRuntime {
  const { textSizeClass: uiPanelKeyValueTextSizeClass, fontClass: uiPanelTextFontClass } = usePanelTypography()
  const uiPanelRowDensityDefaultClass = useGraphStore(
    s => s.uiPanelRowDensityDefaultClass || 'py-1',
  )
  const uiPanelRowDensityCompactClass = useGraphStore(
    s => s.uiPanelRowDensityCompactClass || 'py-0.5',
  )

  return {
    uiPanelKeyValueTextSizeClass,
    uiPanelTextFontClass,
    uiPanelRowDensityDefaultClass,
    uiPanelRowDensityCompactClass,
  }
}

export function useCanvasKeyTypeValueStaticRowProps(
  density: 'default' | 'compact' = 'default',
  activeClassName = UI_THEME_TOKENS.table.rowHoverHighlight,
  help?: MainPanelFieldHelp,
): CanvasKeyTypeValueStaticRowSharedProps {
  const runtime = useCanvasKeyTypeValueRuntime()
  const densityClassName = resolveCanvasKeyTypeValueDensityClassName(runtime, density)

  const presentCells = React.useCallback<NonNullable<KeyTypeValueStaticRowProps['presentCells']>>(
    cells => prepareMainPanelRowHelp(cells, help), [help],
  )
  return React.useMemo(() => ({
    presentCells,
    textSizeClassName: runtime.uiPanelKeyValueTextSizeClass,
    fontClassName: runtime.uiPanelTextFontClass,
    densityClassName,
    activeClassName,
  }), [
    presentCells,
    activeClassName,
    densityClassName,
    runtime.uiPanelKeyValueTextSizeClass,
    runtime.uiPanelTextFontClass,
  ])
}
