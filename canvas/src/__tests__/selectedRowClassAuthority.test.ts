import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  UI_SELECTED_ROW_ACTIVE_CLASS_NAME,
  UI_SELECTED_ROW_INACTIVE_CLASS_NAME,
  uiCurrentChoiceRowIsSelected,
  uiSelectableRowClassName,
  uiSelectedRowStateClassName,
} from 'grph-shared/ui/selectedRowClasses'

const listSourceFiles = (root: string): string[] =>
  readdirSync(root).flatMap(name => {
    const path = resolve(root, name)
    return statSync(path).isDirectory()
      ? listSourceFiles(path)
      : /\.(?:ts|tsx)$/.test(name)
        ? [path]
        : []
  })

export function testSelectedRowClassAuthorityForbidsLegacyDuplicateVariants() {
  if (!UI_SELECTED_ROW_ACTIVE_CLASS_NAME.includes('border')) {
    throw new Error('expected the shared selected-row authority to own the full-row border')
  }
  if (uiSelectedRowStateClassName(true) !== UI_SELECTED_ROW_ACTIVE_CLASS_NAME) {
    throw new Error('expected active selected rows to resolve through the shared class authority')
  }
  if (uiSelectedRowStateClassName(false) !== '') {
    throw new Error('expected inactive rows to add no selected-row classes')
  }
  if (uiSelectableRowClassName(true) !== UI_SELECTED_ROW_ACTIVE_CLASS_NAME) {
    throw new Error('expected selected full rows to use the shared active authority')
  }
  if (uiSelectableRowClassName(false) !== UI_SELECTED_ROW_INACTIVE_CLASS_NAME || !UI_SELECTED_ROW_INACTIVE_CLASS_NAME.includes('border-transparent')) {
    throw new Error('expected neutral full rows to use the shared stable-border authority')
  }
  if (uiCurrentChoiceRowIsSelected('default') !== true || uiCurrentChoiceRowIsSelected(undefined) !== true) {
    throw new Error('expected every resolved current choice, including defaults, to render as selected')
  }

  const repositoryRoot = resolve(process.cwd(), '..')
  const packageJson = readFileSync(resolve(repositoryRoot, 'grph-shared/package.json'), 'utf8')
  if (!packageJson.includes('"./ui/selectedRowClasses"')) {
    throw new Error('expected grph-shared to publish the selected-row class authority')
  }
  const toolbarDropdownSource = readFileSync(resolve(repositoryRoot, 'canvas/src/components/toolbar/ToolbarDropdownSelect.tsx'), 'utf8')
  const rowValueSource = readFileSync(resolve(repositoryRoot, 'canvas/src/components/ui/SelectableRowValue.tsx'), 'utf8')
  const uiCopySource = readFileSync(resolve(repositoryRoot, 'canvas/src/lib/config-copy/uiCopy.ts'), 'utf8')
  if ((toolbarDropdownSource.match(/uiSelectableRowClassName\(/g) || []).length !== 2) {
    throw new Error('expected parent and child toolbar rows to share the full selectable-row utility')
  }
  if (toolbarDropdownSource.includes('UI_THEME_TOKENS.button.hoverBg')) {
    throw new Error('expected toolbar rows to avoid a parallel neutral-row style composition')
  }
  for (const required of ['<output', 'role="status"', 'data-kg-selection-affordance="row-value"', 'data-kg-row-value={props.value}', 'data-kg-row-value-invocation', 'data-kg-row-value-mcp-tool', 'data-kg-row-value-command', 'data-kg-row-value-semantic', 'data-kg-row-value-binding']) {
    if (!rowValueSource.includes(required)) {
      throw new Error(`expected semantic row values to expose selection-tooling affordance: ${required}`)
    }
  }
  if (rowValueSource.includes('<div') || rowValueSource.includes('aria-hidden')) {
    throw new Error('expected row values to forbid generic or accessibility-hidden decoration')
  }
  if (!toolbarDropdownSource.includes('<SelectableRowValue') || !toolbarDropdownSource.includes('aria-label={child.title}')) {
    throw new Error('expected toolbar rows to expose semantic values while preserving actionable button names')
  }
  if (!uiCopySource.includes("canvasViewModeTitle: 'Canvas View Mode'") || uiCopySource.includes("canvasViewModeTitle: '2D Mode'")) {
    throw new Error('expected the toolbar trigger to preserve the canonical Canvas View Mode name')
  }
  const canvasViewSource = readFileSync(resolve(repositoryRoot, 'canvas/src/components/toolbar/Canvas2dRendererSelect.tsx'), 'utf8')
  for (const required of ['buildCanvasViewInvocation', 'CANVAS_VIEW_MCP_TOOL_NAME', 'registerCanvasViewControlHandler']) {
    if (!canvasViewSource.includes(required)) {
      throw new Error(`expected Canvas View row values to reuse the shared invocation owner: ${required}`)
    }
  }
  const interactionSource = readFileSync(resolve(repositoryRoot, 'canvas/src/components/toolbar/InteractionModeSelect.tsx'), 'utf8')
  for (const required of ['SelectableRowValue', 'buildCanvasInteractionInvocation', 'CANVAS_INTERACTION_MCP_TOOL_NAME', 'registerCanvasInteractionControlHandler']) {
    if (!interactionSource.includes(required)) {
      throw new Error(`expected Interaction row values to reuse the shared invocation owner: ${required}`)
    }
  }
  const launchRowValueSource = readFileSync(resolve(repositoryRoot, 'canvas/src/lib/toolbar/WorkspaceLaunchRowValue.tsx'), 'utf8')
  for (const required of ['SelectableRowValue', 'buildWorkspaceLaunchInvocation', 'WORKSPACE_LAUNCH_MCP_TOOL_NAME']) {
    if (!launchRowValueSource.includes(required)) {
      throw new Error(`expected Launch row values to reuse the shared invocation owner: ${required}`)
    }
  }

  const staleNames = ['uiPrimary', 'ChipActiveClassName', 'primary', 'ChipActive']
  const staleExportName = `${staleNames[0]}${staleNames[1]}`
  const staleTokenName = `${staleNames[2]}${staleNames[3]}`
  const sourceFiles = [
    ...listSourceFiles(resolve(repositoryRoot, 'canvas/src')),
    ...listSourceFiles(resolve(repositoryRoot, 'grph-shared/src')),
  ].filter(path => !path.endsWith('selectedRowClassAuthority.test.ts') && !path.endsWith('selectedRowClasses.ts'))

  for (const path of sourceFiles) {
    const text = readFileSync(path, 'utf8')
    if (text.includes(staleExportName) || text.includes(staleTokenName)) {
      throw new Error(`legacy selected-row authority remains in ${path}`)
    }
    const directRowVariant = /(?:UI_RESPONSIVE_MENU(?:_OPTION)?_ROW_CLASSNAME|w-full\s+text-left|flex-1[^\n]*text-left)[^\n]{0,320}UI_THEME_TOKENS\.button\.active(?:Bg|Border|Text)/
    if (directRowVariant.test(text)) {
      throw new Error(`direct selected-row token composition remains in ${path}`)
    }
    if (text.includes('UI_SELECTED_ROW_ACTIVE_CLASS_NAME')) {
      throw new Error(`selected-row consumers must use the shared state utility in ${path}`)
    }
    if (text.includes('UI_SELECTED_ROW_INACTIVE_CLASS_NAME')) {
      throw new Error(`neutral-row consumers must use the shared selectable-row utility in ${path}`)
    }
    const directBlueSelectedRow = /(?:DESIGN_PANEL_(?:TREE|LIST)_ROW_CLASSNAME|px-3 py-2 text-sm flex items-center justify-between)[^\n]{0,240}(?:bg-blue-50|dark:bg-blue-900\/20)/
    if (directBlueSelectedRow.test(text)) {
      throw new Error(`direct blue selected-row literal remains in ${path}`)
    }
  }
}
