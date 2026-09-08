import { readNumFromStorage, writeNumToStorage, readBoolFromStorage, writeBoolToStorage, readIntFromStorage, writeIntToStorage } from '@/lib/persistence'
import { MemoryStorage } from '@/tests/lib/memoryStorage'

export async function testPersistencePrimitives() {
  await testCoalescedStorageAuthority()
  const storage = new MemoryStorage()

  const numEmpty = readNumFromStorage(storage, 'k-num', 0.5)
  if (numEmpty !== 0.5) {
    throw new Error('expected numeric fallback when storage empty')
  }

  storage.setItem('k-num', '0.2')
  const numLow = readNumFromStorage(storage, 'k-num', 0.5)
  if (numLow !== 0.2) {
    throw new Error('expected parsed numeric value')
  }

  storage.setItem('k-num', '2.5')
  const numClampedHigh = readNumFromStorage(storage, 'k-num', 0.5)
  if (numClampedHigh !== 1) {
    throw new Error('expected numeric value to be clamped to 1')
  }

  const writtenNum = writeNumToStorage(storage, 'k-num-write', 1.5)
  if (writtenNum !== 1) {
    throw new Error('expected writeNumToStorage to clamp to 1')
  }
  const rawWrittenNum = storage.getItem('k-num-write')
  if (rawWrittenNum !== '1') {
    throw new Error('expected storage to contain clamped numeric string')
  }

  const boolEmpty = readBoolFromStorage(storage, 'k-bool', true)
  if (boolEmpty !== true) {
    throw new Error('expected boolean fallback when storage empty')
  }

  storage.setItem('k-bool', '1')
  const boolTrue = readBoolFromStorage(storage, 'k-bool', false)
  if (boolTrue !== true) {
    throw new Error('expected true when storage contains 1')
  }

  storage.setItem('k-bool', 'false')
  const boolFalse = readBoolFromStorage(storage, 'k-bool', true)
  if (boolFalse !== false) {
    throw new Error('expected false when storage contains false')
  }

  const writtenBoolTrue = writeBoolToStorage(storage, 'k-bool-write', true)
  if (writtenBoolTrue !== true) {
    throw new Error('expected writeBoolToStorage to return true')
  }
  const rawBoolTrue = storage.getItem('k-bool-write')
  if (rawBoolTrue !== '1') {
    throw new Error('expected storage to contain 1 for true')
  }

  const writtenBoolFalse = writeBoolToStorage(storage, 'k-bool-write', false)
  if (writtenBoolFalse !== false) {
    throw new Error('expected writeBoolToStorage to return false')
  }
  const rawBoolFalse = storage.getItem('k-bool-write')
  if (rawBoolFalse !== '0') {
    throw new Error('expected storage to contain 0 for false')
  }

  const intEmpty = readIntFromStorage(storage, 'k-int', 10)
  if (intEmpty !== 10) {
    throw new Error('expected int fallback when storage empty')
  }

  storage.setItem('k-int', '42')
  const intParsed = readIntFromStorage(storage, 'k-int', 10)
  if (intParsed !== 42) {
    throw new Error('expected parsed int value')
  }

  const writtenIntDefaultBounds = writeIntToStorage(storage, 'k-int-write', 0)
  if (writtenIntDefaultBounds !== 1) {
    throw new Error('expected int to respect default min bound')
  }
  const rawIntDefaultBounds = storage.getItem('k-int-write')
  if (rawIntDefaultBounds !== '1') {
    throw new Error('expected storage to contain clamped min int')
  }

  const writtenIntWithBounds = writeIntToStorage(storage, 'k-int-write2', 5000, { min: 10, max: 100 })
  if (writtenIntWithBounds !== 100) {
    throw new Error('expected int to respect max bound')
  }
  const rawIntWithBounds = storage.getItem('k-int-write2')
  if (rawIntWithBounds !== '100') {
    throw new Error('expected storage to contain clamped max int')
  }
}


async function testCoalescedStorageAuthority() {
  const { lsSetJsonCoalesced, lsSetIntCoalesced, lsSetBoolCoalesced, resolveBrowserStorageKey } = await import('@/lib/persistence')
  const { LS_KEYS } = await import('@/lib/config')
  const { initWindowHarness } = await import('@/tests/lib/windowHarness')
  const { initJsdomHarness } = await import('@/tests/lib/jsdomHarness')
  const { cancelWorkspaceSyncTask, scheduleWorkspaceSyncTask } = await import('@/lib/async/workspaceSyncScheduler')
  class ObservedStorage extends MemoryStorage {
    writes = 0
    failNextWrite = false
    override setItem(key: string, value: string) {
      if (key === rawKey) {
        if (this.failNextWrite) { this.failNextWrite = false; throw new Error('Owned quota failure') }
        this.writes += 1
      }
      super.setItem(key, value)
    }
  }
  const first = new ObservedStorage(), second = new ObservedStorage()
  const browser = initJsdomHarness()
  const harness = initWindowHarness({ storage: first })
  const target = window, descriptor = Object.getOwnPropertyDescriptor(target, 'localStorage')!
  const key = LS_KEYS.graphData, rawKey = resolveBrowserStorageKey(key)
  const flush = () => new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Storage batch did not flush within one second')), 1000)
    scheduleWorkspaceSyncTask('storage-fixture:flush', () => { clearTimeout(deadline); resolve() }, 0)
  })
  const expect = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }
  const cases = [
    { kind: 'json', write: (n: number) => lsSetJsonCoalesced(key, { version: n }, { delayMs: 0, signature: 'same-hint' }), raw: '{"version":2}' },
    { kind: 'int', write: (n: number) => lsSetIntCoalesced(key, n, { delayMs: 0 }), raw: '2' },
    { kind: 'bool', write: (n: number) => lsSetBoolCoalesced(key, n === 2, { delayMs: 0 }), raw: '1' },
  ]
  try {
    for (const { kind, write, raw } of cases) {
      Object.defineProperty(target, 'localStorage', { ...descriptor, value: first })
      first.clear(); second.clear()
      scheduleWorkspaceSyncTask('storage-fixture:unrelated', () => first.setItem('unrelated-key', 'retained'), 0)
      let before = first.writes
      write(1); write(2); await flush()
      expect(first.getItem('unrelated-key') === 'retained', `${kind}: unrelated queued work must survive`)
      expect(first.getItem(rawKey) === raw && first.writes === before + 1, `${kind}: latest pending value must coalesce into one write (raw=${first.getItem(rawKey)}, writes=${first.writes - before})`)
      before = first.writes
      write(2); await flush()
      expect(first.writes === before, `${kind}: equal current storage must avoid a write`)
      Object.defineProperty(target, 'localStorage', { ...descriptor, value: second })
      write(2); await flush()
      expect(second.getItem(rawKey) === raw, `${kind}: replacement storage must receive an identical value`)
      second.clear(); write(2); await flush()
      expect(second.getItem(rawKey) === raw, `${kind}: cleared storage must receive an identical value`)
      second.setItem(rawKey, 'external-change'); write(2); await flush()
      expect(second.getItem(rawKey) === raw, `${kind}: external changes must not be hidden by cached values`)
      second.clear(); second.failNextWrite = true; write(2); await flush()
      expect(second.getItem(rawKey) === null, `${kind}: failed write must remain absent`)
      write(2); await flush()
      expect(second.getItem(rawKey) === raw, `${kind}: identical retry must recover a failed write`)
    }
  } finally {
    cancelWorkspaceSyncTask('storage-fixture:unrelated')
    cancelWorkspaceSyncTask('storage-fixture:flush')
    for (const { kind } of cases) cancelWorkspaceSyncTask(`ls:coalesced:${kind}:${key}`)
    Object.defineProperty(target, 'localStorage', descriptor)
    try { harness.restore() } finally { browser.restore() }
  }
}
