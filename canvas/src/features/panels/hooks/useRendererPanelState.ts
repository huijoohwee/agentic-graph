import { useCallback, useState } from 'react'
import { LS_KEYS, buildRenderSectionToggleAnalyticsEvent, type LsStorageKey, type RenderSectionId, type RenderSectionToggleAnalyticsEvent } from '@/lib/config'
import usePersistedBoolean from '@/features/hooks/usePersistedBoolean'

type RenderSectionToggleSource = 'floatingPanel' | 'panel'

type RenderSectionToggleEventDetail = RenderSectionToggleAnalyticsEvent & {
  source: RenderSectionToggleSource
}

function emitRenderSectionToggle(sectionId: RenderSectionId, collapsed: boolean, source: RenderSectionToggleSource) {
  if (typeof window === 'undefined') return
  try {
    const payload = buildRenderSectionToggleAnalyticsEvent(sectionId, collapsed)
    if (!payload) return
    const event = new CustomEvent<RenderSectionToggleEventDetail>('kg-render-section-toggle', {
      detail: { ...payload, collapsed, source },
    })
    window.dispatchEvent(event)
  } catch {
    void 0
  }
}

type DisclosureState = readonly [boolean, (collapsed: boolean) => void]

function useRendererPreference(key: LsStorageKey, initial: boolean, id: RenderSectionId, source: RenderSectionToggleSource): DisclosureState {
  const [collapsed, setCollapsed] = usePersistedBoolean(key, initial)
  const update = useCallback((next: boolean) => {
    emitRenderSectionToggle(id, next, source)
    setCollapsed(next)
  }, [id, setCollapsed, source])
  return [collapsed, update]
}

/** Graph owns the preference keys and the sections available in each renderer. */
export function useRendererPanelState({ source, tuning, radar, flowchart, design }: {
  source: RenderSectionToggleSource; tuning: boolean; radar: boolean; flowchart: boolean; design: boolean
}) {
  const sections = {
    links: useRendererPreference(LS_KEYS.renderThreeLinksCollapsed, false, 'threeLinks', source),
    layout: useRendererPreference(LS_KEYS.renderThreeLayoutCollapsed, false, 'threeLayout', source),
    backgroundFog: useRendererPreference(LS_KEYS.renderThreeBackgroundFogCollapsed, false, 'threeBackgroundFog', source),
    starfield: useRendererPreference(LS_KEYS.renderThreeStarfieldCollapsed, false, 'threeStarfield', source),
    camera: useRendererPreference(LS_KEYS.renderThreeCameraCollapsed, false, 'threeCamera', source),
    selection: useRendererPreference(LS_KEYS.renderThreeSelectionCollapsed, false, 'threeSelection', source),
    presets: useRendererPreference(LS_KEYS.renderPresetsCollapsed, true, 'renderPresets', source),
    codebaseIndex: useRendererPreference(LS_KEYS.renderCodebaseIndexCollapsed, true, 'codebaseIndexPipeline', source),
    globeEffects: useState(false),
    appearance: useState(false),
    mediaNodes: useState(true),
    edgeTypes: useState(false),
    radar: useState(false),
    flowchart: useState(false),
    design: useState(false),
    richMedia: useState(false),
  }
  const visible = [sections.appearance, sections.presets, sections.mediaNodes, sections.codebaseIndex, sections.edgeTypes, sections.richMedia]
  if (radar) visible.push(sections.radar)
  if (flowchart) visible.push(sections.flowchart)
  if (design) visible.push(sections.design)
  // Children of Layout follow the same bulk action, including before their first mount.
  const affected = tuning ? [...visible, sections.links, sections.layout, sections.globeEffects,
    sections.backgroundFog, sections.starfield, sections.camera, sections.selection] : visible
  const setAll = (collapsed: boolean) => {
    for (const [current, set] of affected) if (current !== collapsed) set(collapsed)
  }
  const disclosure = (key: keyof typeof sections) => {
    const [collapsed, onToggle] = sections[key]
    return { collapsed, onToggle }
  }
  return { allCollapsed: visible.every(([collapsed]) => collapsed), setAll, disclosure }
}

export type RendererSectionDisclosure = ReturnType<typeof useRendererPanelState>['disclosure']
