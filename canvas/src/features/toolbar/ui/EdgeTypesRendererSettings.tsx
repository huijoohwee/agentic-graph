import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphSchema } from '@/lib/graph/schema'
import {
  ensureEdgeAnimationStyleElement,
  GLOBAL_EDGE_COLOR_OPTIONS,
  getGlobalEdgeTypeOptionsFor2dRenderer,
  readGlobalEdgeAnimationEnabled,
  readEffectiveEdgeTypeFor2dRenderer,
  readGlobalEdgeColor,
  readGlobalEdgeThicknessPx,
  readGlobalEdgeType,
  type GlobalEdgeType,
  withGlobalEdgeAnimationEnabled,
  withGlobalEdgeColor,
  withGlobalEdgeThicknessPx,
  withGlobalEdgeType,
} from '@/lib/graph/edgeTypes'
import { scheduleWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import {
  WORKSPACE_SYNC_SCOPE_RENDERER_EDGE_TYPE_RUNTIME_PERSISTENCE,
  WORKSPACE_SYNC_TASK_RENDERER_EDGE_TYPE_VIEW_STATE,
} from '@/lib/async/workspaceSyncKeys'
import {
  ResponsiveControlRow,
  ResponsiveSelectRow,
} from '@/lib/ui/responsiveControlRows'
import {
  UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_END_CLASSNAME,
  UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { uiToolbarSettingsPanelBodyClassName } from '@/features/toolbar/ui/toolbarStyles'

type ThreeEdgeRendererType = 'mesh' | 'shaderLine' | 'tubeBridge'

const THREE_EDGE_RENDERER_OPTIONS: Array<{ value: ThreeEdgeRendererType; label: string }> = [
  { value: 'mesh', label: 'Mesh' },
  { value: 'shaderLine', label: 'Shader Line' },
  { value: 'tubeBridge', label: 'Bridge Tubes' },
]

const EDGE_THICKNESS_OPTIONS = [1, 1.5, 2, 2.5, 3, 4, 5] as const

export function EdgeTypesRendererSettings(props: {
  selectedEdgeType?: GlobalEdgeType
  onSelectEdgeType?: (next: GlobalEdgeType) => void
}) {
  const onSelectEdgeTypeProp = props.onSelectEdgeType
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || '')
  const schema = useGraphStore(s => s.schema)
  const canvasRenderMode = useGraphStore(s => s.canvasRenderMode)
  const canvas2dRenderer = useGraphStore(s => s.canvas2dRenderer)
  const canvas3dMode = useGraphStore(s => s.canvas3dMode)
  const threeEdgeRenderer = useGraphStore(s => s.threeEdgeRenderer)
  const setThreeEdgeRenderer = useGraphStore(s => s.setThreeEdgeRenderer)
  const setSchema = useGraphStore(s => s.setSchema)
  const edgeType = readGlobalEdgeType(schema)
  const edgeColor = readGlobalEdgeColor(schema)
  const edgeThicknessPx = readGlobalEdgeThicknessPx(schema)
  const edgeAnimated = readGlobalEdgeAnimationEnabled(schema)
  const selectedEdgeType = props.selectedEdgeType ?? edgeType
  const effectiveEdgeType =
    canvasRenderMode === '2d'
      ? readEffectiveEdgeTypeFor2dRenderer({ schema, canvas2dRenderer })
      : edgeType
  const options = React.useMemo(
    () => (canvasRenderMode === '2d' ? getGlobalEdgeTypeOptionsFor2dRenderer(canvas2dRenderer) : getGlobalEdgeTypeOptionsFor2dRenderer(null)),
    [canvas2dRenderer, canvasRenderMode],
  )

  const setEdgeType = React.useCallback((next: GlobalEdgeType) => {
    scheduleWorkspaceSyncTask(
      WORKSPACE_SYNC_TASK_RENDERER_EDGE_TYPE_VIEW_STATE,
      () => {
        const current = useGraphStore.getState().schema as GraphSchema
        const nextSchema = withGlobalEdgeType(current, next)
        if (nextSchema === current) return
        setSchema(nextSchema)
      },
      0,
      {
        scopeKey: WORKSPACE_SYNC_SCOPE_RENDERER_EDGE_TYPE_RUNTIME_PERSISTENCE,
      },
    )
  }, [setSchema])

  const setEdgeThicknessPx = React.useCallback((nextRaw: unknown) => {
    scheduleWorkspaceSyncTask(
      WORKSPACE_SYNC_TASK_RENDERER_EDGE_TYPE_VIEW_STATE,
      () => {
        const current = useGraphStore.getState().schema as GraphSchema
        const nextSchema = withGlobalEdgeThicknessPx(current, nextRaw)
        if (nextSchema === current) return
        setSchema(nextSchema)
      },
      0,
      {
        scopeKey: WORKSPACE_SYNC_SCOPE_RENDERER_EDGE_TYPE_RUNTIME_PERSISTENCE,
      },
    )
  }, [setSchema])

  const setEdgeColor = React.useCallback((nextRaw: unknown) => {
    scheduleWorkspaceSyncTask(
      WORKSPACE_SYNC_TASK_RENDERER_EDGE_TYPE_VIEW_STATE,
      () => {
        const current = useGraphStore.getState().schema as GraphSchema
        const nextSchema = withGlobalEdgeColor(current, nextRaw)
        if (nextSchema === current) return
        setSchema(nextSchema)
      },
      0,
      {
        scopeKey: WORKSPACE_SYNC_SCOPE_RENDERER_EDGE_TYPE_RUNTIME_PERSISTENCE,
      },
    )
  }, [setSchema])

  const setEdgeAnimated = React.useCallback((next: boolean) => {
    scheduleWorkspaceSyncTask(
      WORKSPACE_SYNC_TASK_RENDERER_EDGE_TYPE_VIEW_STATE,
      () => {
        const current = useGraphStore.getState().schema as GraphSchema
        const nextSchema = withGlobalEdgeAnimationEnabled(current, next)
        if (nextSchema === current) return
        setSchema(nextSchema)
      },
      0,
      {
        scopeKey: WORKSPACE_SYNC_SCOPE_RENDERER_EDGE_TYPE_RUNTIME_PERSISTENCE,
      },
    )
  }, [setSchema])

  const onSelectEdgeType = React.useCallback((next: GlobalEdgeType) => {
    if (onSelectEdgeTypeProp) {
      onSelectEdgeTypeProp(next)
      return
    }
    setEdgeType(next)
  }, [onSelectEdgeTypeProp, setEdgeType])

  const onSelectThreeEdgeRenderer = React.useCallback((next: string) => {
    const value = String(next || '').trim()
    const normalized: ThreeEdgeRendererType = value === 'shaderLine' || value === 'tubeBridge' ? value : 'mesh'
    setThreeEdgeRenderer(normalized)
  }, [setThreeEdgeRenderer])

  React.useEffect(() => {
    if (!edgeAnimated) return
    ensureEdgeAnimationStyleElement(typeof document !== 'undefined' ? document : null)
  }, [edgeAnimated])

  return (
    <CollapsibleSection title="Edge Types" defaultCollapsed={false} stickyHeader={false} headerClassName={`px-2 ${uiPanelTextFontClass}`}>
      <section className={uiToolbarSettingsPanelBodyClassName}>
        <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
          Applies globally to Flowchart, Flow Canvas, Design, Storyboard Widget, document modes, 2D/3D/geospatial surfaces, and Text/Image/Video widgets. Default is Bezier with animated blue edges.
        </section>
        <ResponsiveSelectRow
          label="Type"
          value={selectedEdgeType}
          onChange={next => onSelectEdgeType((String(next || '').trim().toLowerCase() as GlobalEdgeType))}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </ResponsiveSelectRow>
        <ResponsiveSelectRow
          label="Color"
          value={edgeColor}
          onChange={setEdgeColor}
        >
          {GLOBAL_EDGE_COLOR_OPTIONS.map(option => (
            <option key={option.key} value={option.value}>
              {option.label}
            </option>
          ))}
        </ResponsiveSelectRow>
        <ResponsiveSelectRow
          label="Thickness"
          value={String(edgeThicknessPx)}
          onChange={setEdgeThicknessPx}
        >
          {EDGE_THICKNESS_OPTIONS.map(v => (
            <option key={v} value={String(v)}>
              {`${v}px`}
            </option>
          ))}
        </ResponsiveSelectRow>
        <ResponsiveControlRow label="Animate" valueClassName={UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_END_CLASSNAME}>
          <input
            type="checkbox"
            className={UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME}
            checked={edgeAnimated}
            onChange={e => setEdgeAnimated(e.target.checked)}
          />
        </ResponsiveControlRow>
        {canvasRenderMode === '3d' || (canvasRenderMode === '2d' && canvas3dMode === 'voxel') ? (
          <ResponsiveSelectRow
            label="3D/Voxel"
            value={threeEdgeRenderer}
            onChange={onSelectThreeEdgeRenderer}
          >
            {THREE_EDGE_RENDERER_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ResponsiveSelectRow>
        ) : null}
      </section>
    </CollapsibleSection>
  )
}
