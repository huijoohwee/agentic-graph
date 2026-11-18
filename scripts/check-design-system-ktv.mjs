import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8')
const row=read('grph-shared/src/react/keyTypeValueRow.tsx'),geo=read('gympgrph/src/geospatialPanelUi.tsx'),form=read('canvas/src/lib/ui/panelFormControls.tsx')
assert(row.includes("from 'agentic-design-system/react/ktv'"));assert(row.includes('<DesignSystemKeyTypeValueRow'))
assert(!/<dl\b/.test(row+geo+form),'product KTV bindings cannot recreate row markup')
assert(geo.includes("from 'agentic-design-system/react/ktv'"));assert(!geo.includes('KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME'))
assert(!form.includes('KTV_FIELD_GRID_CLASS_NAME'),'form fields must use the same renderer')
const base=read('node_modules/@agentic-base/views-react/packages/views-react/src/controls/MenuControls.tsx')
assert(!base.includes('function KeyTypeValueRow'),'the installed Base source cannot retain the row renderer')
for(const p of ['package.json','canvas/package.json'])assert.equal(JSON.parse(read(p)).dependencies['agentic-design-system'],'github:huijoohwee/agentic-design-system#f23afe6fbb873ebff230b8c0829e8b9a81aa8e78')
console.log('PASS direct Design System KTV ownership; no Base, form or geospatial row variant')

assert(read('canvas/src/features/panels/views/graph-fields/GraphFieldsPanelControls.tsx').includes("from '@/lib/ui/panelFormControls'"))

const header=read('grph-shared/src/react/keyTypeValueLayout.tsx'),contract=read('grph-shared/src/ui/keyTypeValueRows.ts')
assert(header.includes("from 'agentic-design-system/react/ktv'"));assert(header.includes('<KeyTypeValueRow'));assert(!header.includes('KTV_FIELD_GRID_CLASS_NAME'))
assert(contract.includes('KTV_FIELD_GRID_CLASS_NAME = KTV_ROW_CLASS'));assert(!contract.includes('grid-cols-['))

const lock=JSON.parse(read('package-lock.json')),basePin=JSON.parse(read('package.json')).dependencies['@agentic-base/views-react']
assert.equal(JSON.parse(read('canvas/package.json')).dependencies['@agentic-base/views-react'],basePin)
for(const [name,entry] of Object.entries(lock.packages))if(name.endsWith('@agentic-base/views-react'))assert(entry.resolved?.endsWith(basePin.slice(-40)),'nested Base lock source must match the single pinned owner')

assert(read('canvas/vite.config.ts').includes("'yjs', 'agentic-design-system/ktv'"),'shared native entrypoint must prebundle before lazy panels open')

for (const p of ['canvas/src/features/panels/ui/Tooltip.tsx','canvas/src/features/panels/ui/NativeTitleTooltip.tsx','canvas/src/features/panels/ui/tooltipUtils.ts']) assert(!fs.existsSync(path.join(root,p)),'Retired hover implementations must be absent')
assert(read('canvas/src/main.tsx').includes("from 'agentic-design-system/react/hover'"))
assert(!/export function build(?:Numeric|SettingsValue|SettingsKey|RoleActionOutcome|Default)Tooltip/.test(read('canvas/src/lib/config-copy/tooltips.ts')))
console.log('PASS direct Design System hover ownership; no local panel, title delegate or generic syntax variant')

assert(read('node_modules/agentic-design-system/site/key-type-value.js').includes('export function createKeyTypeValueRows'))
assert(read('node_modules/agentic-design-system/packages/react-ktv/src/index.tsx').includes('key={row.id}'))

for (const [file, symbol] of [['CollapsibleSection.tsx', 'CollapsibleSection as default'], ['ExpandCollapseAllButton.tsx', 'ExpandCollapseAllButton as default'], ['useCollapsibleSectionGroup.ts', 'useCollapsibleSectionGroup']]) {
  const source = read(`canvas/src/features/panels/ui/${file}`)
  assert(source.includes(symbol) && source.includes("from 'agentic-design-system/react/panels'"))
  assert(!/function |useState|onKeyDown|onClick|position:|overflow-/.test(source), 'Graph section contracts cannot retain an implementation')
}
assert(read('canvas/src/features/panels/ui/MainPanelBody.tsx').includes('PanelScrollRegion'))
assert(read('canvas/src/features/observability-workspace/ObservabilityWorkspace.tsx').includes('PanelScrollRegion'))
console.log('PASS direct Design System section, collapse-group and scrolling ownership')

for (const [file, entry] of [['canvas/src/lib/ui/colorValue.ts','agentic-design-system/color'],['canvas/src/features/markdown/markdownIt.ts','agentic-design-system/markdown/parser'],['canvas/src/lib/markdown-core/ui/MarkdownInlineSelectionToolbar.tsx','agentic-design-system/react/rich-text']]) {
  const source=read(file); if(!source.includes(entry)) throw new Error(`Shared Markdown owner missing: ${file}`)
}

assert(read('canvas/src/lib/markdown-core/ui/MarkdownPreviewViewer.impl.tsx').includes("from 'agentic-design-system/react/viewer'"))
assert(read('canvas/src/lib/markdown-core/ui/MarkdownBlockContainerCore.impl.engine.runtime.tsx').includes('<ViewerSurface as={Tag}'))
assert(!/innerHTML\s*=|textContent\s*=|getMarkdownIt/.test(read('canvas/src/lib/markdown-core/ui/markdownBlockContainerCore.editInitialization.ts')),'activation must not rebuild rendered content')
