import type { MemoryStorage } from '@/tests/lib/memoryStorage'

type HarnessWindow = Window &
  typeof globalThis & {
    navigator?: Navigator
  }

export type WindowHarnessEnv = {
  g: HarnessWindow
  storage: Storage
  restore: () => void
}

type WindowHarnessOptions = {
  storage?: MemoryStorage | Storage
  navigatorOnline?: boolean
  withCustomEvent?: boolean
}

type PropertyOwner = { active: boolean; installed: PropertyDescriptor }
type PropertyScope = { baseline?: PropertyDescriptor; owners: PropertyOwner[] }
const propertyScopes = new WeakMap<object, Map<string, PropertyScope>>()

const sameDescriptor = (left?: PropertyDescriptor, right?: PropertyDescriptor): boolean => {
  if (!left || !right) return left === right
  return (['value', 'get', 'set', 'writable', 'enumerable', 'configurable'] as const)
    .every(key => Object.is(left[key], right[key]))
}

const restoreDescriptor = (target: object, key: string, descriptor?: PropertyDescriptor): void => {
  if (descriptor) Object.defineProperty(target, key, descriptor)
  else if (!Reflect.deleteProperty(target, key)) throw new Error(`Cannot restore WindowHarness property ${key}`)
}

const liveScope = (target: object, key: string): PropertyScope | undefined => {
  const scopes = propertyScopes.get(target)
  const scope = scopes?.get(key)
  if (scope && !sameDescriptor(Object.getOwnPropertyDescriptor(target, key), scope.owners.at(-1)?.installed)) {
    scopes!.delete(key) // Another owner replaced this property; old scopes cannot reclaim it.
    return undefined
  }
  return scope
}

const acquireProperty = (target: object, key: string, value?: unknown, borrow = false): (() => void) => {
  let scope = liveScope(target, key)
  if (borrow && !scope) return () => void 0
  const previous = Object.getOwnPropertyDescriptor(target, key)
  if (!borrow) {
    Object.defineProperty(target, key, previous?.configurable === false
      ? { value }
      : { configurable: true, enumerable: previous?.enumerable ?? true, writable: true, value })
  }
  const installed = Object.getOwnPropertyDescriptor(target, key)!
  if (!scope) scope = { baseline: previous, owners: [] }
  const scopes = propertyScopes.get(target) ?? new Map<string, PropertyScope>()
  propertyScopes.set(target, scopes)
  scopes.set(key, scope)
  const owner: PropertyOwner = { active: true, installed }
  scope.owners.push(owner)
  const ownedScope = scope
  return () => {
    if (!owner.active) return
    owner.active = false
    if (scopes.get(key) !== ownedScope || ownedScope.owners.at(-1) !== owner) return
    if (!sameDescriptor(Object.getOwnPropertyDescriptor(target, key), installed)) {
      scopes.delete(key)
      return
    }
    // Retired outer scopes are skipped, so out-of-order cleanup cannot resurrect them.
    let lastActive = ownedScope.owners.length - 1
    while (lastActive >= 0 && !ownedScope.owners[lastActive].active) lastActive -= 1
    ownedScope.owners.length = lastActive + 1
    try { restoreDescriptor(target, key, ownedScope.owners.at(-1)?.installed ?? ownedScope.baseline) }
    finally { if (!ownedScope.owners.length) scopes.delete(key) }
  }
}

const throwErrors = (errors: unknown[]): void => {
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw new AggregateError(errors, errors.map(error => String((error as Error)?.message ?? error)).join('; '))
}

// Select native Node behavior while retaining the same nested/later-owner rules.
export function initNodeWindowHarness(): Pick<WindowHarnessEnv, 'restore'> {
  return { restore: acquireProperty(globalThis, 'window', undefined) }
}

export function initWindowHarness(options?: WindowHarnessOptions): WindowHarnessEnv {
  const g = globalThis as unknown as HarnessWindow
  const resolvedStorage: Storage = options?.storage ?? g.localStorage ?? ({} as Storage)
  const releases: Array<() => void> = []
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    const errors: unknown[] = []
    for (const release of [...releases].reverse()) {
      try { release() } catch (error) { errors.push(error) }
    }
    throwErrors(errors)
  }

  try {
    // Borrowing an external DOM never grants authority to restore its global reference.
    // Nested harnesses may hold a reference installed by an earlier harness until both retire.
    releases.push(g.window ? acquireProperty(g, 'window', undefined, true) : acquireProperty(g, 'window', g))
    const windowTarget = g.window
    for (const target of new Set([g, windowTarget])) {
      releases.push(acquireProperty(target, 'localStorage', resolvedStorage))
    }
    if (typeof options?.navigatorOnline === 'boolean') {
      releases.push(acquireProperty(g, 'navigator', { onLine: options.navigatorOnline }))
    }
    if (options?.withCustomEvent !== false) {
      const CustomEventImpl = class<T = unknown> {
        type: string
        detail: T | null
        constructor(type: string, init?: CustomEventInit<T>) {
          this.type = type
          this.detail = init && typeof init.detail !== 'undefined' ? init.detail ?? null : null
        }
      }
      releases.push(acquireProperty(g, 'CustomEvent', CustomEventImpl))
      const dispatchEvent = () => true
      for (const target of new Set([g, windowTarget])) {
        releases.push(acquireProperty(target, 'dispatchEvent', dispatchEvent))
      }
    }
  } catch (error) {
    const errors = [error]
    try { restore() } catch (restoreError) { errors.push(restoreError) }
    throwErrors(errors)
  }
  return { g, storage: resolvedStorage, restore }
}
