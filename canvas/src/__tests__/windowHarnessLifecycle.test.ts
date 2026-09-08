import assert from 'node:assert/strict'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initNodeWindowHarness, initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { testWorkspaceImportExtensionlessPlainTextCsvIsDetectedFromBody } from './workspaceImportUrlContentFormat.test'

const globalKeys = ['window', 'localStorage', 'navigator', 'CustomEvent', 'dispatchEvent']
const windowKeys = ['localStorage', 'dispatchEvent']
const snapshot = (target: object, keys: string[]) => keys.map(key => ({
  target, key, descriptor: Object.getOwnPropertyDescriptor(target, key),
}))
const assertUnchanged = (entries: ReturnType<typeof snapshot>) => {
  for (const { target, key, descriptor } of entries) {
    assert.deepEqual(Object.getOwnPropertyDescriptor(target, key), descriptor, `restore exact ${key} descriptor`)
  }
}
const restoreSnapshot = (entries: ReturnType<typeof snapshot>) => {
  for (const { target, key, descriptor } of entries) {
    if (descriptor) Object.defineProperty(target, key, descriptor)
    else Reflect.deleteProperty(target, key)
  }
}

export async function testWindowHarnessClosedDomDoesNotPoisonNextImport() {
  const baseline = snapshot(globalThis, globalKeys)
  const dom = initJsdomHarness()
  const borrowedWindow = dom.dom.window
  const borrowedProperties = snapshot(borrowedWindow, windowKeys)
  const window = initWindowHarness({ storage: new MemoryStorage(), navigatorOnline: false })
  try {
    dom.restore()
    window.restore()
    assert.notEqual(globalThis.window, borrowedWindow, 'must not resurrect the borrowed closed DOM')
    assertUnchanged(baseline)
    assertUnchanged(borrowedProperties)
    assert.throws(() => borrowedWindow.location, /_location/, 'the original DOM remains natively closed')
    assert.throws(() => borrowedWindow.localStorage, /_origin/)
    await testWorkspaceImportExtensionlessPlainTextCsvIsDetectedFromBody()
  } finally {
    window.restore()
    restoreSnapshot(baseline)
  }
}

export function testWindowHarnessNestedScopesRestoreBothOrders() {
  const dom = initJsdomHarness()
  try {
    for (const outerFirst of [false, true]) {
      const baseline = [...snapshot(globalThis, globalKeys), ...snapshot(dom.dom.window, windowKeys)]
      const firstStorage = new MemoryStorage()
      const secondStorage = new MemoryStorage()
      const outer = initWindowHarness({ storage: firstStorage, navigatorOnline: false })
      const inner = initWindowHarness({ storage: secondStorage, navigatorOnline: true })
      try {
        if (outerFirst) {
          outer.restore()
          assert.equal(globalThis.localStorage, secondStorage)
          assert.equal(dom.dom.window.localStorage, secondStorage)
          assert.equal(globalThis.navigator.onLine, true)
          inner.restore()
        } else {
          inner.restore()
          assert.equal(globalThis.localStorage, firstStorage)
          assert.equal(dom.dom.window.localStorage, firstStorage)
          assert.equal(globalThis.navigator.onLine, false)
          outer.restore()
        }
        assertUnchanged(baseline)
      } finally { inner.restore(); outer.restore() }
    }
  } finally { dom.restore() }
}

export function testWindowHarnessPreservesLaterWindowAndPropertyOwners() {
  const outerDom = initJsdomHarness()
  const globalBaseline = snapshot(globalThis, globalKeys)
  const outerProperties = snapshot(outerDom.dom.window, windowKeys)
  const window = initWindowHarness({ storage: new MemoryStorage() })
  const laterDom = initJsdomHarness()
  const laterProperties = snapshot(laterDom.dom.window, windowKeys)
  const laterStorage = new MemoryStorage()
  const laterDescriptor = { configurable: true, enumerable: false, writable: false, value: laterStorage }
  Object.defineProperty(globalThis, 'localStorage', laterDescriptor)
  try {
    window.restore()
    assert.equal(globalThis.window, laterDom.dom.window)
    assert.equal(globalThis.document, laterDom.dom.window.document)
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), laterDescriptor)
    assertUnchanged(laterProperties)
    assertUnchanged(outerProperties)
  } finally {
    window.restore()
    laterDom.restore()
    restoreSnapshot(globalBaseline)
    outerDom.restore()
  }
}

export function testWindowHarnessCreatedWindowRemainsUntilBorrowersRetire() {
  const baseline = snapshot(globalThis, globalKeys)
  Reflect.deleteProperty(globalThis, 'window')
  const outer = initWindowHarness({ storage: new MemoryStorage(), withCustomEvent: false })
  const inner = initWindowHarness({ storage: new MemoryStorage(), withCustomEvent: false })
  try {
    outer.restore()
    assert.equal(globalThis.window, globalThis, 'an active inner harness still borrows this installed reference')
    inner.restore()
    assert.equal(Object.getOwnPropertyDescriptor(globalThis, 'window'), undefined)
  } finally {
    inner.restore()
    outer.restore()
    restoreSnapshot(baseline)
  }
}

export function testWindowHarnessRestoreIsIdempotentAfterLaterMutation() {
  const dom = initJsdomHarness()
  const baseline = snapshot(globalThis, globalKeys)
  const window = initWindowHarness({ storage: new MemoryStorage() })
  try {
    window.restore()
    assertUnchanged(baseline)
    const laterStorage = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: false, value: laterStorage })
    const later = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    window.restore()
    window.restore()
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), later)
  } finally {
    restoreSnapshot(baseline)
    dom.restore()
  }
}

export function testWindowHarnessSetupFailureRollsBackAndReportsNativeError() {
  const dom = initJsdomHarness()
  const baseline = snapshot(globalThis, globalKeys)
  const fixedStorage = new MemoryStorage()
  Object.defineProperty(dom.dom.window, 'localStorage', {
    configurable: false, writable: false, value: fixedStorage,
  })
  try {
    assert.throws(() => initWindowHarness({ storage: new MemoryStorage() }), TypeError)
    assertUnchanged(baseline)
    assert.equal(dom.dom.window.localStorage, fixedStorage)
  } finally { dom.restore() }
}

export function testNodeWindowHarnessNestedScopesRestoreBothOrders() {
  const dom = initJsdomHarness()
  const baseline = snapshot(globalThis, globalKeys)
  try {
    for (const outerFirst of [false, true]) {
      const outer = initNodeWindowHarness()
      const inner = initNodeWindowHarness()
      try {
        assert.equal(typeof window, 'undefined', 'native filesystem readers require no browser window')
        if (outerFirst) {
          outer.restore()
          assert.equal(typeof window, 'undefined', 'inner Node scope remains active')
          inner.restore()
        } else {
          inner.restore()
          assert.equal(typeof window, 'undefined', 'outer Node scope remains active')
          outer.restore()
        }
        assertUnchanged(baseline)
        outer.restore()
        inner.restore()
        assertUnchanged(baseline)
      } finally { inner.restore(); outer.restore() }
    }
  } finally { dom.restore() }
}

export function testNodeWindowHarnessPreservesLaterWindowOwner() {
  const dom = initJsdomHarness()
  const baseline = snapshot(globalThis, ['window'])
  const scope = initNodeWindowHarness()
  const laterWindow = { location: { href: 'https://later-owner.invalid/' } }
  const later = { configurable: true, enumerable: false, get: () => laterWindow }
  try {
    Object.defineProperty(globalThis, 'window', later)
    scope.restore()
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'window'), { ...later, set: undefined })
    assert.equal(globalThis.window, laterWindow, 'retired Node scope must preserve the later owner')
    scope.restore()
    assert.equal(globalThis.window, laterWindow, 'repeated cleanup must remain inert')
  } finally {
    scope.restore()
    restoreSnapshot(baseline)
    dom.restore()
  }
}
