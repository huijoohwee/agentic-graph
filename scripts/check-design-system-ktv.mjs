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
for(const p of ['package.json','canvas/package.json'])assert.equal(JSON.parse(read(p)).dependencies['agentic-design-system'],'github:huijoohwee/agentic-design-system#eab0dcaad86c3d2cfd0c6eebf60070998fdb3b1e')
console.log('PASS direct Design System KTV ownership; no Base, form or geospatial row variant')

assert(read('canvas/src/features/panels/views/graph-fields/GraphFieldsPanelControls.tsx').includes("from '@/lib/ui/panelFormControls'"))

const header=read('grph-shared/src/react/keyTypeValueLayout.tsx'),contract=read('grph-shared/src/ui/keyTypeValueRows.ts')
assert(header.includes("from 'agentic-design-system/react/ktv'"));assert(header.includes('<KeyTypeValueRow'));assert(!header.includes('KTV_FIELD_GRID_CLASS_NAME'))
assert(contract.includes('KTV_FIELD_GRID_CLASS_NAME = KTV_ROW_CLASS'));assert(!contract.includes('grid-cols-['))

const lock=JSON.parse(read('package-lock.json')),basePin=JSON.parse(read('package.json')).dependencies['@agentic-base/views-react']
assert.equal(JSON.parse(read('canvas/package.json')).dependencies['@agentic-base/views-react'],basePin)
for(const [name,entry] of Object.entries(lock.packages))if(name.endsWith('@agentic-base/views-react'))assert(entry.resolved?.endsWith(basePin.slice(-40)),'nested Base lock source must match the single pinned owner')

assert(read('canvas/vite.config.ts').includes("'yjs', 'agentic-design-system/ktv'"),'shared native entrypoint must prebundle before lazy panels open')
