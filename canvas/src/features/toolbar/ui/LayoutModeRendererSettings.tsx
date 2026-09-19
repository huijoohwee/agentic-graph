import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import {
  FLOW_FRONTMATTER_INITIAL_FIT_FILL_RATIO,
  FLOW_FRONTMATTER_INITIAL_FIT_FILL_RATIO_MAX,
  FLOW_FRONTMATTER_INITIAL_FIT_FILL_RATIO_MIN,
  FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_DESKTOP,
  FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_LAPTOP,
  FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MAX,
  FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN,
  FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_PHONE,
  FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_TABLET,
} from '@/components/FlowCanvas/frontmatterLayoutConfig'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphSchema } from '@/lib/graph/schema'
import { readLayoutMode2d, type LayoutMode2d } from '@/lib/graph/layoutMode'
import { resolveFitReferenceFrame } from '@/components/FlowCanvas/fitRuntime'
import {
  ResponsiveControlInput,
  ResponsiveControlRow,
  ResponsiveNumberRow,
  ResponsiveSelectRow,
} from '@/lib/ui/responsiveControlRows'
import {
  UI_RESPONSIVE_CONTROL_HINT_CLASSNAME,
  UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME,
  UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  uiToolbarSettingsPanelActionGroupClassName,
  uiToolbarSettingsPanelBodyClassName,
  uiToolbarSettingsPanelFooterClassName,
  uiToolbarSettingsPanelSubsectionClassName,
  uiToolbarSettingsPanelTextActionClassName,
} from '@/features/toolbar/ui/toolbarStyles'

const LAYOUT_MODE_OPTIONS: Array<{ value: LayoutMode2d; label: string }> = [
  { value: 'radial', label: 'Radial (default)' },
  { value: 'block', label: 'Block' },
]

export function LayoutModeRendererSettings(props: {
  selectedLayoutMode?: LayoutMode2d
  onSelectLayoutMode?: (next: LayoutMode2d) => void
  disabled?: boolean
  embedded?: boolean
  inspection?: boolean
}) {
  const onSelectLayoutModeProp = props.onSelectLayoutMode
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || '')
  const schema = useGraphStore(s => s.schema)
  const setSchema = useGraphStore(s => s.setSchema)
  const canvas2dRenderer = useGraphStore(s => s.canvas2dRenderer)
  const frontmatterModeEnabled = useGraphStore(s => s.frontmatterModeEnabled === true)
  const frontmatterFlowInitialFitFillRatio = useGraphStore(s => s.frontmatterFlowInitialFitFillRatio)
  const viewportFitFillRatio = useGraphStore(s => s.viewportFitFillRatio)
  const setViewportFitFillRatio = useGraphStore(s => s.setViewportFitFillRatio)
  const viewportFitReferenceWidth = useGraphStore(s => s.viewportFitReferenceWidth)
  const setViewportFitReferenceWidth = useGraphStore(s => s.setViewportFitReferenceWidth)
  const viewportFitReferenceHeight = useGraphStore(s => s.viewportFitReferenceHeight)
  const setViewportFitReferenceHeight = useGraphStore(s => s.setViewportFitReferenceHeight)
  const setFrontmatterFlowInitialFitFillRatio = useGraphStore(s => s.setFrontmatterFlowInitialFitFillRatio)
  const frontmatterFlowOverlayFitProxyScalePhone = useGraphStore(s => s.frontmatterFlowOverlayFitProxyScalePhone)
  const setFrontmatterFlowOverlayFitProxyScalePhone = useGraphStore(s => s.setFrontmatterFlowOverlayFitProxyScalePhone)
  const frontmatterFlowOverlayFitProxyScaleTablet = useGraphStore(s => s.frontmatterFlowOverlayFitProxyScaleTablet)
  const setFrontmatterFlowOverlayFitProxyScaleTablet = useGraphStore(s => s.setFrontmatterFlowOverlayFitProxyScaleTablet)
  const frontmatterFlowOverlayFitProxyScaleLaptop = useGraphStore(s => s.frontmatterFlowOverlayFitProxyScaleLaptop)
  const setFrontmatterFlowOverlayFitProxyScaleLaptop = useGraphStore(s => s.setFrontmatterFlowOverlayFitProxyScaleLaptop)
  const frontmatterFlowOverlayFitProxyScaleDesktop = useGraphStore(s => s.frontmatterFlowOverlayFitProxyScaleDesktop)
  const setFrontmatterFlowOverlayFitProxyScaleDesktop = useGraphStore(s => s.setFrontmatterFlowOverlayFitProxyScaleDesktop)
  const layoutMode = readLayoutMode2d(schema)
  const selectedLayoutMode = props.selectedLayoutMode ?? layoutMode
  const disabled = props.disabled === true
  const showFrontmatterFlowControls = !props.inspection && (canvas2dRenderer === 'storyboard' || frontmatterModeEnabled)
  const fitReferenceFrame = React.useMemo(() => resolveFitReferenceFrame({
    referenceWidth: viewportFitReferenceWidth,
    referenceHeight: viewportFitReferenceHeight,
  }), [viewportFitReferenceHeight, viewportFitReferenceWidth])
  const frontmatterProxyFields = React.useMemo(() => ([
    {
      key: 'phone',
      label: 'Phone proxy',
      hint: '<=430px',
      value: frontmatterFlowOverlayFitProxyScalePhone,
      setValue: setFrontmatterFlowOverlayFitProxyScalePhone,
      defaultValue: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_PHONE,
    },
    {
      key: 'tablet',
      label: 'Tablet proxy',
      hint: '<=768px',
      value: frontmatterFlowOverlayFitProxyScaleTablet,
      setValue: setFrontmatterFlowOverlayFitProxyScaleTablet,
      defaultValue: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_TABLET,
    },
    {
      key: 'laptop',
      label: 'Laptop proxy',
      hint: '<=1280px',
      value: frontmatterFlowOverlayFitProxyScaleLaptop,
      setValue: setFrontmatterFlowOverlayFitProxyScaleLaptop,
      defaultValue: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_LAPTOP,
    },
    {
      key: 'desktop',
      label: 'Desktop proxy',
      hint: '>1280px',
      value: frontmatterFlowOverlayFitProxyScaleDesktop,
      setValue: setFrontmatterFlowOverlayFitProxyScaleDesktop,
      defaultValue: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_DESKTOP,
    },
  ]), [
    frontmatterFlowOverlayFitProxyScaleDesktop,
    frontmatterFlowOverlayFitProxyScaleLaptop,
    frontmatterFlowOverlayFitProxyScalePhone,
    frontmatterFlowOverlayFitProxyScaleTablet,
    setFrontmatterFlowOverlayFitProxyScaleDesktop,
    setFrontmatterFlowOverlayFitProxyScaleLaptop,
    setFrontmatterFlowOverlayFitProxyScalePhone,
    setFrontmatterFlowOverlayFitProxyScaleTablet,
  ])

  const setLayoutMode = React.useCallback((next: LayoutMode2d) => {
    const current = useGraphStore.getState().schema as GraphSchema
    const layout = current.layout || {}
    setSchema({
      ...current,
      layout: {
        ...layout,
        mode: next,
      },
    })
  }, [setSchema])

  const onSelectLayoutMode = React.useCallback((next: LayoutMode2d) => {
    if (onSelectLayoutModeProp) {
      onSelectLayoutModeProp(next)
      return
    }
    setLayoutMode(next)
  }, [onSelectLayoutModeProp, setLayoutMode])

  const controls = (
      <section className={uiToolbarSettingsPanelBodyClassName}>
        <section className={`text-[10px] ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
          Global layout mode shared across 2D/3D renderers and semantic views.
        </section>
        <ResponsiveSelectRow
          label="Mode"
          value={selectedLayoutMode}
          disabled={disabled}
          onChange={next => onSelectLayoutMode((String(next || '').trim().toLowerCase() === 'block' ? 'block' : 'radial'))}
        >
          {LAYOUT_MODE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </ResponsiveSelectRow>
        <section className={uiToolbarSettingsPanelSubsectionClassName}>
          <section className={`text-[10px] ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
            {props.inspection ? 'Fit fill applies to the retained D3 viewport. Reference dimensions apply to the workspace canvas.' : 'Shared fit frame for Pin, Fit to View, Fit to Screen, and Zoom to Selection. Frame is clamped upstream against the live viewport.'}
          </section>
          <ResponsiveNumberRow
            label="Fit fill"
            step={0.01}
            min={0.2}
            max={0.95}
            value={viewportFitFillRatio}
            disabled={disabled}
            onChange={setViewportFitFillRatio}
          />
          <ResponsiveNumberRow
            label="Fit width"
            step={1}
            min={320}
            max={7680}
            value={viewportFitReferenceWidth}
            disabled={disabled || props.inspection}
            onChange={setViewportFitReferenceWidth}
          />
          <ResponsiveNumberRow
            label="Fit height"
            step={1}
            min={180}
            max={4320}
            value={viewportFitReferenceHeight}
            disabled={disabled || props.inspection}
            onChange={setViewportFitReferenceHeight}
          />
          <section className={`text-[10px] ${UI_THEME_TOKENS.text.tertiary} leading-snug text-right`}>
            Active fit frame {fitReferenceFrame.width}×{fitReferenceFrame.height}
          </section>
        </section>
        {showFrontmatterFlowControls ? (
          <section className={uiToolbarSettingsPanelSubsectionClassName}>
            <section className={`text-[10px] ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
              Frontmatter Storyboard Widget fit controls. Lower proxy values fit a denser overlay footprint and make the on-screen collective larger.
            </section>
            <ResponsiveNumberRow
              label="Initial fit fill"
              step={0.01}
              min={FLOW_FRONTMATTER_INITIAL_FIT_FILL_RATIO_MIN}
              max={FLOW_FRONTMATTER_INITIAL_FIT_FILL_RATIO_MAX}
              value={frontmatterFlowInitialFitFillRatio}
              disabled={disabled}
              onChange={setFrontmatterFlowInitialFitFillRatio}
            />
            {frontmatterProxyFields.map(field => (
              <ResponsiveControlRow key={field.key} label={field.label} valueClassName={UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME}>
                <ResponsiveControlInput
                  type="number"
                  step={0.01}
                  min={FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN}
                  max={FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MAX}
                  value={field.value}
                  disabled={disabled}
                  onChange={e => {
                    const next = Number.parseFloat(e.target.value)
                    if (Number.isFinite(next)) field.setValue(Math.max(FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN, Math.min(FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MAX, next)))
                  }}
                  className={`${UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME} text-right`}
                />
                <span className={`${UI_RESPONSIVE_CONTROL_HINT_CLASSNAME} ${UI_THEME_TOKENS.text.tertiary}`}>
                  {field.hint}
                </span>
              </ResponsiveControlRow>
            ))}
            <section className={uiToolbarSettingsPanelFooterClassName}>
              <span className={`text-[10px] ${UI_THEME_TOKENS.text.tertiary}`}>
                Adaptive frontmatter defaults
              </span>
              <section className={uiToolbarSettingsPanelActionGroupClassName}>
                <button
                  type="button"
                  className={`${uiToolbarSettingsPanelTextActionClassName} text-[11px] ${UI_THEME_TOKENS.panel.headerBg} ${UI_THEME_TOKENS.text.secondary}`}
                  disabled={disabled}
                  onClick={() => {
                    setFrontmatterFlowInitialFitFillRatio(FLOW_FRONTMATTER_INITIAL_FIT_FILL_RATIO)
                    setFrontmatterFlowOverlayFitProxyScalePhone(FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_PHONE)
                    setFrontmatterFlowOverlayFitProxyScaleTablet(FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_TABLET)
                    setFrontmatterFlowOverlayFitProxyScaleLaptop(FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_LAPTOP)
                    setFrontmatterFlowOverlayFitProxyScaleDesktop(FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_DESKTOP)
                  }}
                >
                  Reset frontmatter
                </button>
              </section>
            </section>
          </section>
        ) : null}
      </section>
  )
  return props.embedded ? controls : <CollapsibleSection title="Layout" defaultCollapsed={false} stickyHeader={false} headerClassName={`px-2 ${uiPanelTextFontClass}`}>{controls}</CollapsibleSection>
}
