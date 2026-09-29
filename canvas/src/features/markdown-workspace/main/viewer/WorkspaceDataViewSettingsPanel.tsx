import React from 'react'
import { ArrowLeftRight, ArrowUpDown, Filter, Globe2, LayoutGrid, RotateCcw, SlidersHorizontal, Table as TableIcon } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { WorkspaceDataViewSettingsPropertiesSection } from './WorkspaceDataViewSettingsPropertiesSection'
import { WorkspaceDataViewSettingsFilterSection } from './WorkspaceDataViewSettingsFilterSection'
import { WorkspaceDataViewSettingsSortSection } from './WorkspaceDataViewSettingsSortSection'
import { LayoutChoice, WorkspaceDataViewCompactCheckbox } from './WorkspaceDataViewSettingsPrimitives'
import { buildSuggestedRoles } from './workspaceDataViewGraphRoles'
import { WORKSPACE_EDITOR_MODE_OPTIONS, type WorkspaceEditorMode } from '@/features/workspace-table/workspaceEditorMode'
import { getWorkspaceEditorModeLabel } from '@/features/workspace-table/workspaceEditorModePresentation'
import {
  DATA_VIEW_FIELD_LINE_OPTIONS,
  DATA_VIEW_ROW_HEIGHT_OPTIONS,
  coerceDataViewFieldLineMode,
  coerceDataViewRowHeightPreset,
  readDataViewFieldLineLabel,
  readDataViewRowHeightLabel,
} from '@/lib/ui/dataViewDensity'
import { PanelField, PanelSelect, PanelTextInput, readPanelChoiceSurfaceClassName } from '@/lib/ui/panelFormControls'
import { MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME } from '@/features/panels/ui/mainPanelSettingsSelectClass'
import { MainPanelSettingsPanelShell } from '@/features/panels/ui/MainPanelSettingsPanelShell'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import ExpandCollapseAllButton from '@/features/panels/ui/ExpandCollapseAllButton'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_DATA_VIEW_HEADER_ACTIONS_CLASSNAME,
  UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_PANEL_FIELD_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'
import { setWorkspaceDataViewFloatingDensity, type WorkspaceDataViewFloatingBinding, type WorkspaceDataViewSettingsPanelKey } from './workspaceDataViewFloatingStore'
import { WorkspaceDataViewNewRecordButton } from './WorkspaceDataViewNewRecordButton'
import { coerceStructuredSourceValueColumnMode, type WorkspaceStructuredSourceValueColumnMode } from './workspaceDataViewConfig'
import { hasStructuredSourceValueColumnMode } from './workspaceStructuredSourceDataViewPresentation'

type WorkspaceDataViewSettingsPanelProps = Omit<WorkspaceDataViewFloatingBinding, 'registrationId'> & {
  title?: string
}

const VIEW_SECTION_HEADER_SPACING_CLASS_NAME = 'pt-[3px] pb-[3px]'

export function WorkspaceDataViewSettingsPanel(props: WorkspaceDataViewSettingsPanelProps) {
  const layoutModeOptions = React.useMemo(
    () => WORKSPACE_EDITOR_MODE_OPTIONS.filter(mode => props.allowMultiDimLayout || mode !== 'multiDimTable'),
    [props.allowMultiDimLayout],
  )

  const shownCount = React.useMemo(() => {
    return props.viewConfig.visibleColumnIds
      ? props.viewConfig.visibleColumnIds.length
      : props.columns.length
  }, [props.columns.length, props.viewConfig.visibleColumnIds])

  const groupableColumns = React.useMemo(() => {
    return props.columns
  }, [props.columns])
  const currentSortRule = props.viewConfig.sortRules[0] || null
  const filterRuleCount = props.viewConfig.filterGroups.reduce((count, group) => count + group.rules.length, 0)
  const groupByColumnName = props.columns.find(column => column.id === props.viewConfig.groupByColumnId)?.name || 'None'
  const sortColumnName = currentSortRule ? (props.columns.find(column => column.id === currentSortRule.columnId)?.name || currentSortRule.columnId) : 'None'
  const orientation = props.viewConfig.orientation === 'columns' ? 'columns' : 'rows'
  const structuredSourceValueColumnMode = coerceStructuredSourceValueColumnMode(props.viewConfig.structuredSourceValueColumnMode)
  const canChooseStructuredSourceValueColumnMode = React.useMemo(
    () => hasStructuredSourceValueColumnMode(props.columns),
    [props.columns],
  )
  const rowHeightPreset = coerceDataViewRowHeightPreset(props.viewConfig.rowHeightPreset)
  const fieldLineMode = coerceDataViewFieldLineMode(props.viewConfig.fieldLineMode)
  const setOrientationFromWorkbench = React.useCallback((nextOrientation: 'rows' | 'columns') => {
    if (orientation === nextOrientation) return
    props.setViewConfig({
      ...props.viewConfig,
      orientation: nextOrientation,
    })
  }, [orientation, props])
  const setStructuredSourceValueColumnMode = React.useCallback((nextMode: WorkspaceStructuredSourceValueColumnMode) => {
    if (structuredSourceValueColumnMode === nextMode) return
    props.setViewConfig({
      ...props.viewConfig,
      structuredSourceValueColumnMode: nextMode,
      visibleColumnIds: null,
    })
  }, [props, structuredSourceValueColumnMode])

  const buildCollapsedState = React.useCallback(
    (expandedPanel?: WorkspaceDataViewSettingsPanelKey | null): Record<WorkspaceDataViewSettingsPanelKey, boolean> => ({
      layout: expandedPanel !== 'layout',
      properties: expandedPanel !== 'properties',
      filter: expandedPanel !== 'filter',
      sort: expandedPanel !== 'sort',
      group: expandedPanel !== 'group',
      reset: expandedPanel !== 'reset',
    }),
    [],
  )
  const [collapsedByPanel, setCollapsedByPanel] = React.useState<Record<WorkspaceDataViewSettingsPanelKey, boolean>>(
    () => buildCollapsedState(props.activePanel),
  )

  React.useEffect(() => {
    setCollapsedByPanel(buildCollapsedState(props.activePanel))
  }, [buildCollapsedState, props.activePanel])

  const setGraphEnabled = React.useCallback((next: boolean) => {
    if ((props.viewConfig.graphEnabled === true) === next) return
    const nextView = {
      ...props.viewConfig,
      graphEnabled: next,
      geospatialViewEnabled: next ? props.viewConfig.geospatialViewEnabled : false,
    }
    const hasAnyRole =
      props.viewConfig.graphRolesByColumnId
      && Object.keys(props.viewConfig.graphRolesByColumnId).length > 0
    if (next && !hasAnyRole) {
      nextView.graphRolesByColumnId = buildSuggestedRoles(props.columns)
    }
    props.onChangeLayoutMode?.(next ? 'multiDimTable' : 'table')
    props.setViewConfig(nextView)
  }, [props.columns, props.onChangeLayoutMode, props.setViewConfig, props.viewConfig])

  const title = props.title || MARKDOWN_DATA_VIEW_COPY.viewSettingsLabel
  const sectionSummaries = React.useMemo(() => ([
    {
      key: 'layout' as const,
      title: 'Layout',
      value: getWorkspaceEditorModeLabel(props.viewerMode || 'table'),
      icon: <LayoutGrid className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'properties' as const,
      title: 'Properties',
      value: `${shownCount} shown`,
      icon: <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'filter' as const,
      title: MARKDOWN_DATA_VIEW_COPY.filterLabel,
      value: filterRuleCount ? `${filterRuleCount} rule${filterRuleCount === 1 ? '' : 's'}` : 'None',
      icon: <Filter className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'sort' as const,
      title: MARKDOWN_DATA_VIEW_COPY.sortLabel,
      value: sortColumnName,
      icon: <ArrowUpDown className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'group' as const,
      title: 'Group',
      value: groupByColumnName,
      icon: <LayoutGrid className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: 'reset' as const,
      title: 'Reset',
      icon: <RotateCcw className="h-4 w-4" aria-hidden="true" />,
    },
  ]), [filterRuleCount, groupByColumnName, props.viewerMode, shownCount, sortColumnName])
  const allCollapsed = React.useMemo(
    () => Object.values(collapsedByPanel).every(Boolean),
    [collapsedByPanel],
  )
  const collapseAll = React.useCallback(() => {
    setCollapsedByPanel(buildCollapsedState(null))
  }, [buildCollapsedState])
  const expandAll = React.useCallback(() => {
    setCollapsedByPanel({
      layout: false,
      properties: false,
      filter: false,
      sort: false,
      group: false,
      reset: false,
    })
  }, [])
  const togglePanel = React.useCallback((panel: WorkspaceDataViewSettingsPanelKey, next: boolean) => {
    setCollapsedByPanel(prev => {
      if (prev[panel] === next) return prev
      return { ...prev, [panel]: next }
    })
  }, [])
  const renderSectionTitle = React.useCallback((panel: WorkspaceDataViewSettingsPanelKey) => {
    const summary = sectionSummaries.find(item => item.key === panel)
    if (!summary) return null
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
        <span className={['shrink-0', UI_THEME_TOKENS.icon.color].join(' ')}>
          {summary.icon}
        </span>
        <span className={['min-w-0', UI_TEXT_TRUNCATE].join(' ')}>
          {summary.title}
        </span>
        {summary.value ? (
          <span className={['shrink-0 text-xs uppercase tracking-normal', UI_THEME_TOKENS.text.tertiary].join(' ')}>
            {summary.value}
          </span>
        ) : null}
      </span>
    )
  }, [sectionSummaries])

  return (
    <MainPanelSettingsPanelShell
      ariaLabel={MARKDOWN_DATA_VIEW_COPY.viewSettingsLabel}
      titleNode={(
        <section className="flex min-w-0 max-w-full flex-col gap-1">
          <h3 className={['text-base font-semibold min-w-0', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}>
            {title}
          </h3>
          <p className={['text-xs min-w-0', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')}>
            {props.contextLabel}
          </p>
        </section>
      )}
      secondaryNode={(
        <ExpandCollapseAllButton
          allCollapsed={allCollapsed}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          titleExpand="Expand"
          titleCollapse="Collapse (Default)"
        />
      )}
      secondaryNodeClassName={`${UI_RESPONSIVE_DATA_VIEW_HEADER_ACTIONS_CLASSNAME} flex shrink-0 items-center justify-end gap-1 text-right`}
      uiPanelKeyValueTextSizeClass="text-xs"
      className="kg-data-view-settings-panel h-full rounded-none border-0"
      headerClassName={['px-3 py-3 border-b', UI_THEME_TOKENS.panel.divider].join(' ')}
      bodyClassName="p-0"
    >
      <main className="kg-data-view-settings-layout flex h-full min-h-0 flex-col">
        <section className="min-w-0 flex-1 overflow-y-auto px-3 pb-3" aria-label="View settings panel">
          <section className={['mt-3 rounded border p-2', UI_THEME_TOKENS.panel.border].join(' ')} aria-label="View query workbench">
            <section className="mt-2 space-y-2" aria-label="View query roles">
              <PanelField
                label="Projection"
                variant="section"
                className={UI_RESPONSIVE_PANEL_FIELD_ROW_CLASSNAME}
                labelClassName={UI_TEXT_TRUNCATE}
              >
                <span className={`${UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME} gap-1`}>
                  <ArrowLeftRight className={['h-4 w-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                  <PanelSelect
                    className={[MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME, 'text-left'].join(' ')}
                    value={orientation}
                    onValueChange={selectedValueInput => setOrientationFromWorkbench(selectedValueInput === 'columns' ? 'columns' : 'rows')}
                  >
                    <option value="rows">Rows as records</option>
                    <option value="columns">Columns as records</option>
                  </PanelSelect>
                </span>
              </PanelField>
              <section className={['text-xs', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')} aria-label="View query summary">
                {`Projection: ${orientation === 'columns' ? 'columns as records' : 'rows as records'}`}
              </section>
              {canChooseStructuredSourceValueColumnMode ? (
                <PanelField
                  label="Value columns"
                  variant="section"
                  className={UI_RESPONSIVE_PANEL_FIELD_ROW_CLASSNAME}
                  labelClassName={UI_TEXT_TRUNCATE}
                >
                  <PanelSelect
                    className={[MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME, 'w-full text-left'].join(' ')}
                    value={structuredSourceValueColumnMode}
                    onValueChange={selectedValueInput => setStructuredSourceValueColumnMode(selectedValueInput === 'type-generic' ? 'type-generic' : 'type-specific')}
                  >
                    <option value="type-specific">Type-specific value columns</option>
                    <option value="type-generic">Type-generic Value column</option>
                  </PanelSelect>
                </PanelField>
              ) : null}
              {props.canMutate && props.onNewRecord ? (
                <WorkspaceDataViewNewRecordButton
                  className="w-full justify-center"
                  labelMode="hover"
                  onClick={() => props.onNewRecord?.()}
                />
              ) : null}
            </section>
          </section>

          <CollapsibleSection
            title={renderSectionTitle('layout')}
            collapsed={collapsedByPanel.layout}
            onToggle={next => togglePanel('layout', next)}
            toolbarAligned
            stickyHeader={false}
            flushTop
            headerClassName={VIEW_SECTION_HEADER_SPACING_CLASS_NAME}
          >
            <section className="space-y-4" aria-label="Layout">
              <PanelField label="View name" variant="section">
                <PanelTextInput
                  className="px-3 py-2 text-sm"
                  value={props.viewConfig.name}
                  onChange={e => {
                    const nextName = e.target.value
                    if (nextName === props.viewConfig.name) return
                    props.setViewConfig({ ...props.viewConfig, name: nextName })
                  }}
                  placeholder="View name"
                />
              </PanelField>

              <section>
                <section className={['flex items-center gap-2 text-sm', UI_THEME_TOKENS.text.secondary].join(' ')}>
                  <LayoutGrid className={['w-4 h-4', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                  <span>Layout</span>
                </section>
                <section className={`${uiToolbarRowScrollClassName} mt-2 gap-2`}>
                  {layoutModeOptions.map(mode => (
                    <LayoutChoice
                      key={mode}
                      active={(props.viewerMode || 'table') === mode}
                      label={getWorkspaceEditorModeLabel(mode)}
                      icon={mode === 'kanban'
                        ? <LayoutGrid className="w-6 h-6" aria-hidden="true" />
                        : <TableIcon className="w-6 h-6" aria-hidden="true" />}
                      onClick={() => {
                        if ((props.viewerMode || 'table') === mode) return
                        if (props.onChangeLayoutMode) {
                          props.onChangeLayoutMode(mode)
                          return
                        }
                        props.onChangeLayout(mode === 'kanban' ? 'kanban' : 'table')
                      }}
                    />
                  ))}
                  <LayoutChoice
                    active={props.viewConfig.geospatialViewEnabled === true}
                    label={MARKDOWN_DATA_VIEW_COPY.geospatialViewLabel}
                    icon={<Globe2 className="w-6 h-6" aria-hidden="true" />}
                    onClick={() => {
                      props.onSelectGeospatialView?.()
                    }}
                  />
                </section>
              </section>

              <fieldset className={['rounded border p-3', UI_THEME_TOKENS.panel.border].join(' ')}>
                <legend className={['px-1 text-sm font-semibold', UI_THEME_TOKENS.text.primary].join(' ')}>
                  Multi-dimensional Table
                </legend>
                <section className={['text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>
                  Configure property mapping in Properties.
                </section>
                <label className="mt-3 flex min-w-0 max-w-full items-center gap-2" aria-label="Enable Multi-dimensional Table graph">
                  <WorkspaceDataViewCompactCheckbox
                    checked={props.viewConfig.graphEnabled === true}
                    onChange={e => setGraphEnabled(e.target.checked)}
                  />
                  <span className={['min-w-0 text-sm', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}>
                    {MARKDOWN_DATA_VIEW_COPY.graphRenderingToggleLabel}
                  </span>
                </label>
              </fieldset>

              <fieldset className={['rounded border p-3', UI_THEME_TOKENS.panel.border].join(' ')}>
                <legend className={['px-1 text-sm font-semibold', UI_THEME_TOKENS.text.primary].join(' ')}>
                  Density
                </legend>
                <section className="space-y-3">
                  <fieldset className="space-y-2">
                    <legend className={['text-xs font-medium', UI_THEME_TOKENS.text.secondary].join(' ')}>
                      {`Row height: ${readDataViewRowHeightLabel(rowHeightPreset)}`}
                    </legend>
                    <section className="grid grid-cols-2 gap-2">
                      {DATA_VIEW_ROW_HEIGHT_OPTIONS.map(option => {
                        const active = rowHeightPreset === option.value
                        return (
                          <label
                            key={option.value}
                            className="block"
                          >
                            <input
                              type="radio"
                              name="workspace-data-view-row-height"
                              className="sr-only"
                              checked={active}
                              onChange={() => {
                                if (rowHeightPreset === option.value) return
                                setWorkspaceDataViewFloatingDensity({ rowHeightPreset: option.value, fieldLineMode })
                                props.setViewConfig({ ...props.viewConfig, rowHeightPreset: option.value })
                              }}
                            />
                            <span className={readPanelChoiceSurfaceClassName({ active })}>
                              <span className="block text-sm font-medium">{option.label}</span>
                              <span className={['mt-1 block text-xs', active ? UI_THEME_TOKENS.button.activeText : UI_THEME_TOKENS.text.secondary].join(' ')}>
                                {option.description}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </section>
                  </fieldset>

                  <fieldset className="space-y-2">
                    <legend className={['text-xs font-medium', UI_THEME_TOKENS.text.secondary].join(' ')}>
                      {`Field line: ${readDataViewFieldLineLabel(fieldLineMode)}`}
                    </legend>
                    <section className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2">
                      {DATA_VIEW_FIELD_LINE_OPTIONS.map(option => {
                        const active = fieldLineMode === option.value
                        return (
                          <label
                            key={option.value}
                            className="block"
                          >
                            <input
                              type="radio"
                              name="workspace-data-view-field-line"
                              className="sr-only"
                              checked={active}
                              onChange={() => {
                                if (fieldLineMode === option.value) return
                                setWorkspaceDataViewFloatingDensity({ rowHeightPreset, fieldLineMode: option.value })
                                props.setViewConfig({ ...props.viewConfig, fieldLineMode: option.value })
                              }}
                            />
                            <span className={readPanelChoiceSurfaceClassName({ active, multiline: true })}>
                              <span className="block text-sm font-medium">{option.label}</span>
                              <span className={['mt-1 block text-xs', active ? UI_THEME_TOKENS.button.activeText : UI_THEME_TOKENS.text.secondary].join(' ')}>
                                {option.description}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </section>
                  </fieldset>
                </section>
              </fieldset>
            </section>
          </CollapsibleSection>

          <CollapsibleSection
            title={renderSectionTitle('properties')}
            collapsed={collapsedByPanel.properties}
            onToggle={next => togglePanel('properties', next)}
            toolbarAligned
            stickyHeader={false}
            headerClassName={VIEW_SECTION_HEADER_SPACING_CLASS_NAME}
          >
            <WorkspaceDataViewSettingsPropertiesSection
              canMutate={props.canMutate}
              columns={props.columns}
              view={props.viewConfig}
              onChangeView={props.setViewConfig}
              onAddColumn={props.onAddColumn}
              onDuplicateColumn={props.onDuplicateColumn}
              onDeleteColumn={props.onDeleteColumn}
              onRenameColumn={props.onRenameColumn}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title={renderSectionTitle('filter')}
            collapsed={collapsedByPanel.filter}
            onToggle={next => togglePanel('filter', next)}
            toolbarAligned
            stickyHeader={false}
            headerClassName={VIEW_SECTION_HEADER_SPACING_CLASS_NAME}
          >
            <WorkspaceDataViewSettingsFilterSection
              columns={props.columns}
              view={props.viewConfig}
              onChangeView={props.setViewConfig}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title={renderSectionTitle('sort')}
            collapsed={collapsedByPanel.sort}
            onToggle={next => togglePanel('sort', next)}
            toolbarAligned
            stickyHeader={false}
            headerClassName={VIEW_SECTION_HEADER_SPACING_CLASS_NAME}
          >
            <WorkspaceDataViewSettingsSortSection
              columns={props.columns}
              view={props.viewConfig}
              onChangeView={props.setViewConfig}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title={renderSectionTitle('group')}
            collapsed={collapsedByPanel.group}
            onToggle={next => togglePanel('group', next)}
            toolbarAligned
            stickyHeader={false}
            headerClassName={VIEW_SECTION_HEADER_SPACING_CLASS_NAME}
          >
            <section aria-label="Group" className="space-y-2">
              <PanelField label="Group by" variant="section">
                <PanelSelect
                  className={[MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME, 'w-full text-left'].join(' ')}
                  value={props.viewConfig.groupByColumnId || ''}
                  onValueChange={selectedValueInput => {
                    const nextGroupByColumnId = selectedValueInput || null
                    if ((props.viewConfig.groupByColumnId || null) === nextGroupByColumnId) return
                    props.setViewConfig({ ...props.viewConfig, groupByColumnId: nextGroupByColumnId })
                  }}
                >
                  <option value="">None</option>
                  {groupableColumns.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </PanelSelect>
              </PanelField>
              <section className={['text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>
                Grouping is available for Select / Multi-select properties.
              </section>
            </section>
          </CollapsibleSection>

          <CollapsibleSection
            title={renderSectionTitle('reset')}
            collapsed={collapsedByPanel.reset}
            onToggle={next => togglePanel('reset', next)}
            toolbarAligned
            stickyHeader={false}
            headerClassName={VIEW_SECTION_HEADER_SPACING_CLASS_NAME}
          >
            <section aria-label="Reset" className="space-y-3">
              <section className={['text-sm font-medium', UI_THEME_TOKENS.text.primary].join(' ')}>
                Reset view state
              </section>
              <section className={['text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>
                Clears local search, grouping, filters, sorting, and view state overrides for the active data view.
              </section>
              <button
                type="button"
                className={['App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg].join(' ')}
                onClick={() => props.onReset?.()}
              >
                Reset view state
              </button>
            </section>
          </CollapsibleSection>
        </section>
      </main>
    </MainPanelSettingsPanelShell>
  )
}
