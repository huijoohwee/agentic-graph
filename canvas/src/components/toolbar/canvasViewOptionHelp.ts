import type { CanvasViewOption } from './canvasViewTypes'
import { buildRoleActionOutcomeTooltip, buildSettingsValueTooltip } from '@/lib/config-copy/tooltips'
import { DEFAULT_CANVAS_2D_RENDERER, getCanvas2dRendererLabel } from '@/lib/config.render'

/** Renderer metadata belongs in the shared hover/focus help, never in extra menu rows. */
export function buildCanvasViewOptionHelp(option: CanvasViewOption): string {
  const value = option.valueLabel || option.label
  const keyHelp = buildRoleActionOutcomeTooltip({
    role: option.rowLabel || 'Canvas view',
    actions: [option.children?.length ? `inspect ${option.label} choices` : `select ${value}`],
    outcome: option.description || (option.children?.length ? 'choose the canvas presentation' : 'update the canvas presentation'),
  })
  const valueHelp = option.id.startsWith('renderer:') && !option.children?.length
    ? buildSettingsValueTooltip({ type: 'string', key: 'canvas2dRenderer',
      defaultValue: getCanvas2dRendererLabel(DEFAULT_CANVAS_2D_RENDERER),
      impact: option.badges?.join(' · ') })
    : ''
  return [keyHelp, valueHelp].filter(Boolean).join('\n')
}
