import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeDynamicGroupResizeHandlePx, readGroupResizeHandleConfig } from '@/lib/canvas/groupResizeHandleConfig'

const readUtf8 = (filePath: string): string => readFileSync(filePath, 'utf8')

export function testCollapsedGroupChevronKeepsDedicatedHitTargetAndClickDetailFallback() {
  const groupsText = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groups.ts'))
  const layoutText = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groupsLayout.ts'))

  if (!groupsText.includes("selectAll<SVGCircleElement, GroupDatum>('circle[data-kg-group-chevron-hit]')")) {
    throw new Error('expected collapsed-group chevron to keep a dedicated invisible hit target')
  }
  if (!groupsText.includes("if (readMouseEventDetail(event) >= 2)") || !groupsText.includes("Number.isFinite(detail) ? detail : 0")) {
    throw new Error('expected group surface clicks to use click detail as a double-click fallback for collapse toggles')
  }
  if (!groupsText.includes("chevronHitSel.on('click', toggleOrExpandGroup)")) {
    throw new Error('expected chevron hit target to reuse the shared collapse toggle handler')
  }
  if (!layoutText.includes('chevronHitRadiusPx: number')) {
    throw new Error('expected group layout engine to position the chevron hit target centrally')
  }
}

export function testGroupResizeHandleStaysTouchTolerant() {
  const cfg = readGroupResizeHandleConfig(null)
  if (cfg.hitRadiusPx < 16) {
    throw new Error('expected default resize handle hit radius to stay touch-tolerant')
  }
  const scaled = computeDynamicGroupResizeHandlePx({
    dotRadiusPx: 6,
    hitRadiusPx: cfg.hitRadiusPx,
    strokeWidthPx: 1.25,
    groupWidth: 80,
    groupHeight: 72,
  })
  if (scaled.hitRadiusPx < 12) {
    throw new Error('expected dynamic resize handle scaling to keep a usable touch hit radius on small groups')
  }
}
