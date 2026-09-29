import { PanelColorPicker } from '@/lib/ui/PanelColorPicker'
import React from 'react';
import {
  KeyTypeValueStaticRow,
  RightAlignedValueCell,
} from 'grph-shared/react/keyTypeValueRow';
import Tooltip from '@/features/panels/ui/Tooltip';
import { useGraphStore } from '@/hooks/useGraphStore';
import { MVP_COLOR_PALETTE } from '@/lib/graph/schema';
import { useRendererPalette } from '@/features/toolbar/hooks/useRendererPalette';
import {
  RENDERER_PALETTE_LIFECYCLE_TOOLTIP,
  RENDERER_PALETTE_ENTRY_KEY_TOOLTIP,
  RENDERER_PALETTE_ENTRY_VALUE_TOOLTIP,
} from '@/lib/config';
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens';
import { PlainTextInputEditor } from '@/components/ui/PlainTextInputEditor';
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography';
import {
  UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME,
  UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses';

export function RendererPaletteSettings() {
  const uiPanelKeyValueInputClass = useGraphStore(
    (s) =>
      s.uiPanelKeyValueInputClass ||
      PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass
  );
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    (s) => s.uiPanelKeyValueTextSizeClass || 'text-sm'
  );
  const uiPanelTextFontClass = useGraphStore(
    (s) => s.uiPanelTextFontClass || 'font-sans'
  );
  const uiPanelRowDensityCompactClass = useGraphStore(
    (s) => s.uiPanelRowDensityCompactClass || 'py-0.5'
  );

  const { palette, handleUpdatePaletteColor } = useRendererPalette();

  const nodeTypes = ['idea', 'hypothesis', 'execution', 'pivot', 'alert'] as const;
  const edgeTypes = ['critical', 'neutral'] as const;

  return (
    <section className="grid grid-cols-1 gap-1">
      <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
        <Tooltip
          content={RENDERER_PALETTE_LIFECYCLE_TOOLTIP}
          maxWidthPx={260}
          contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
          className="break-words"
        >
          <span>
            Lifecycle palette: Blue core ideas, Yellow hypotheses, Green execution, Orange pivots, Red alerts.
          </span>
        </Tooltip>
      </section>
      {nodeTypes.map((type) => (
        <KeyTypeValueStaticRow
          key={`node-${type}`}
          layout="keyIconValue"
          keyNode={
            <Tooltip
              content={RENDERER_PALETTE_ENTRY_KEY_TOOLTIP}
              maxWidthPx={260}
              contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
              className="break-words"
            >
              <span className={`${UI_THEME_TOKENS.text.primary} break-words`}>
                {`renderer:palette.nodes.${type}`}
              </span>
            </Tooltip>
          }
          typeNode={null}
          valueNode={
            <RightAlignedValueCell>
              <Tooltip
                content={RENDERER_PALETTE_ENTRY_VALUE_TOOLTIP}
                maxWidthPx={260}
                contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
                className="w-full"
              >
                <section className={UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME}>
                  <PanelColorPicker

                    value={palette.nodes[type] || MVP_COLOR_PALETTE.nodes[type as keyof typeof MVP_COLOR_PALETTE.nodes]} aria-label={`${type} colour`}
                    onValueChange={nextColor => handleUpdatePaletteColor('node', type, nextColor)}
                  />
                  <PlainTextInputEditor
                    className={`${UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME} ${uiPanelKeyValueInputClass} ${UI_THEME_TOKENS.text.primary}`}
                    value={String(palette.nodes[type] || '')}
                    onChange={(next) => handleUpdatePaletteColor('node', type, next)}
                    placeholder={MVP_COLOR_PALETTE.nodes[type as keyof typeof MVP_COLOR_PALETTE.nodes]}
                  />
                </section>
              </Tooltip>
            </RightAlignedValueCell>
          }
          textSizeClassName={uiPanelKeyValueTextSizeClass}
          fontClassName={uiPanelTextFontClass}
          densityClassName={uiPanelRowDensityCompactClass}
          activeClassName={UI_THEME_TOKENS.table.rowHoverHighlight}
        />
      ))}

      {edgeTypes.map((type) => (
        <KeyTypeValueStaticRow
          key={`edge-${type}`}
          layout="keyIconValue"
          keyNode={
            <Tooltip
              content={RENDERER_PALETTE_ENTRY_KEY_TOOLTIP}
              maxWidthPx={260}
              contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
              className="break-words"
            >
              <span className={`${UI_THEME_TOKENS.text.primary} break-words`}>
                {`renderer:palette.edges.${type}`}
              </span>
            </Tooltip>
          }
          typeNode={null}
          valueNode={
            <RightAlignedValueCell>
              <Tooltip
                content={RENDERER_PALETTE_ENTRY_VALUE_TOOLTIP}
                maxWidthPx={260}
                contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
                className="w-full"
              >
                <section className={UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME}>
                  <PanelColorPicker

                    value={palette.edges[type] || MVP_COLOR_PALETTE.edges[type as keyof typeof MVP_COLOR_PALETTE.edges]} aria-label={`${type} colour`}
                    onValueChange={nextColor => handleUpdatePaletteColor('edge', type, nextColor)}
                  />
                  <PlainTextInputEditor
                    className={`${UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME} ${uiPanelKeyValueInputClass} ${UI_THEME_TOKENS.text.primary}`}
                    value={String(palette.edges[type] || '')}
                    onChange={(next) => handleUpdatePaletteColor('edge', type, next)}
                    placeholder={MVP_COLOR_PALETTE.edges[type as keyof typeof MVP_COLOR_PALETTE.edges]}
                  />
                </section>
              </Tooltip>
            </RightAlignedValueCell>
          }
          textSizeClassName={uiPanelKeyValueTextSizeClass}
          fontClassName={uiPanelTextFontClass}
          densityClassName={uiPanelRowDensityCompactClass}
          activeClassName={UI_THEME_TOKENS.table.rowHoverHighlight}
        />
      ))}
    </section>
  );
}
