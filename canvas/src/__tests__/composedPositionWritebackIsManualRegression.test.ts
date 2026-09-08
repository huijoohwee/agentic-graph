import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testComposedPositionWritebackIsManualOnly() {
  const p = resolve(process.cwd(), 'src', 'hooks', 'store', 'graphDataSlice.ts')
  const boundary = readFileSync(p, 'utf8')
  if (!boundary.includes('...createGraphDataNodeActions(set, get)')) throw new Error('expected graph slice to compose the node action owner')
  const text = readFileSync(resolve(process.cwd(), 'src/hooks/store/graph-data-slice/graphDataComposedSource.ts'), 'utf8') + readFileSync(resolve(process.cwd(), 'src/hooks/store/graph-data-slice/graphDataNodeActions.ts'), 'utf8')
  if (text.includes('composedPendingPositionWriteTimer')) {
    throw new Error('expected composed position writeback to avoid timers')
  }
  if (text.includes('scheduleFlushComposedPositionWrites')) {
    throw new Error('expected composed position writeback to not be auto-scheduled')
  }
  if (!text.includes('flushComposedPositionWritesNow')) {
    throw new Error('expected explicit composed position flush function')
  }
}

