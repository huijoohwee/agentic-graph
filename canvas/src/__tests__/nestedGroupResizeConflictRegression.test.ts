import assert from 'node:assert/strict'
import { observeGroupResizeLayout } from './groupResizeHandleParityRegression.test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readUtf8 = (filePath: string): string => readFileSync(filePath, 'utf8')

export function testNestedGroupResizeKeepsExclusiveActiveHandleOwnership() {
  for (const active of ['parent', 'child']) {
    for (const selected of ['parent', 'child', 'other']) {
      const { handles } = observeGroupResizeLayout({ selected, active })
      for (const [id, handle] of handles) {
        assert.equal(handle.style.display === 'none', id !== active, 'only active resize owns a visible handle')
        assert.equal(handle.attrs.get('data-kg-group-resize-active'), id === active ? '1' : '0')
      }
    }
  }
}

export function testNestedGroupResizeRaisesActiveShapeLayer() {
  const layoutText = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groupsLayout.ts'))
  if (!layoutText.includes('rect.parentNode?.appendChild(rect)')) {
    throw new Error('expected active rect groups to raise within their shape layer during resize')
  }
  if (!layoutText.includes('path.parentNode?.appendChild(path)')) {
    throw new Error('expected active geo groups to raise within their shape layer during resize')
  }
}
