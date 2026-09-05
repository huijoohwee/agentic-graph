import type { act } from 'react'
import type { Root } from 'react-dom/client'

type ReactClient = typeof import('react-dom/client')
type OwnedRoot = { root: Root; document: Document; unmount: () => void }
type WindowClose = { descriptor?: PropertyDescriptor; wrapper: Window['close'] }

const roots = new Set<OwnedRoot>()
const windowCloses = new Map<Window, WindowClose>()
let installedClient: ReactClient | undefined
let reactAct: typeof act
let disposing = false

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)
const throwErrors = (errors: unknown[]): void => {
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw new AggregateError(errors, errors.map(errorMessage).join('; '))
}

// React unmount may read globals even when a fixture has already restored another
// window. Borrow only this document's real DOM APIs, then restore exact descriptors.
const enterOwnerContext = (document: Document): (() => void) => {
  const view = document.defaultView
  const values: Record<string, unknown> = { document, IS_REACT_ACT_ENVIRONMENT: true }
  if (view) {
    values.window = view
    for (const key of ['Node', 'Element', 'HTMLElement', 'Event', 'CustomEvent', 'Range', 'NodeFilter', 'DOMParser', 'HTMLIFrameElement']) {
      values[key] = Reflect.get(view, key)
    }
    for (const key of ['requestAnimationFrame', 'cancelAnimationFrame']) {
      const value = Reflect.get(view, key)
      if (typeof value === 'function') values[key] = value.bind(view)
    }
  }
  const previous = new Map<string, PropertyDescriptor | undefined>()
  const restore = () => {
    const errors: unknown[] = []
    for (const [key, descriptor] of [...previous].reverse()) {
      try {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else if (!Reflect.deleteProperty(globalThis, key)) throw new Error(`Cannot restore test global ${key}`)
      } catch (error) { errors.push(error) }
    }
    throwErrors(errors)
  }
  try {
    for (const [key, value] of Object.entries(values)) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
      previous.set(key, descriptor)
      Object.defineProperty(globalThis, key, descriptor?.configurable === false
        ? { value }
        : { configurable: true, writable: true, enumerable: descriptor?.enumerable ?? true, value })
    }
  } catch (error) {
    const errors = [error]
    try { restore() } catch (restoreError) { errors.push(restoreError) }
    throwErrors(errors)
  }
  return restore
}

const restoreWindowClose = (document: Document): void => {
  const view = document.defaultView
  if (!view || [...roots].some(entry => entry.document.defaultView === view)) return
  const close = windowCloses.get(view)
  if (!close) return
  windowCloses.delete(view)
  if (view.close !== close.wrapper) return
  if (close.descriptor) Object.defineProperty(view, 'close', close.descriptor)
  else Reflect.deleteProperty(view, 'close')
}

const trackRoot = <T extends Root>(root: T, container: Element | Document | DocumentFragment): T => {
  const document = container.ownerDocument ?? container as Document
  const originalUnmount = root.unmount
  const unmountDescriptor = Object.getOwnPropertyDescriptor(root, 'unmount')
  const entry: OwnedRoot = { root, document, unmount: () => root.unmount() }
  const unmount = () => {
    const errors: unknown[] = []
    try { originalUnmount.call(root) } catch (error) { errors.push(error) }
    finally {
      roots.delete(entry)
      try {
        if (unmountDescriptor) Object.defineProperty(root, 'unmount', unmountDescriptor)
        else Reflect.deleteProperty(root, 'unmount')
        restoreWindowClose(document)
      } catch (error) { errors.push(error) }
    }
    throwErrors(errors)
  }
  entry.unmount = unmount
  Object.defineProperty(root, 'unmount', { configurable: true, writable: true, value: unmount })
  roots.add(entry)
  const view = document.defaultView
  if (view && !windowCloses.has(view)) {
    const descriptor = Object.getOwnPropertyDescriptor(view, 'close')
    const originalClose = view.close
    const wrapper = function (this: Window) {
      const errors: unknown[] = []
      try { disposeReactRootsForDocument(document) } catch (error) { errors.push(error) }
      finally {
        try { originalClose.call(this) } catch (error) { errors.push(error) }
      }
      throwErrors(errors)
    }
    Object.defineProperty(view, 'close', { configurable: true, writable: true, value: wrapper })
    windowCloses.set(view, { descriptor, wrapper })
  }
  return root
}

const assertCreationAllowed = () => {
  if (disposing) throw new Error('A React root was created during test cleanup; cleanup must not create roots')
}

// Install before importing test modules so CJS and ESM consumers receive the same
// real factories. Rendering, hydration, options, and returned root identity remain native.
export const installReactRootLifecycle = (client: ReactClient, publicAct: typeof act): void => {
  if (installedClient === client) return
  if (installedClient) throw new Error('Test React root lifecycle already owns a different React client')
  const createRoot = client.createRoot
  const hydrateRoot = client.hydrateRoot
  client.createRoot = function (...args) {
    assertCreationAllowed()
    return trackRoot(createRoot(...args), args[0])
  }
  client.hydrateRoot = function (...args) {
    assertCreationAllowed()
    return trackRoot(hydrateRoot(...args), args[0])
  }
  reactAct = publicAct
  installedClient = client
}

export const readTrackedReactRootCount = (): number => roots.size

const unmountSnapshot = (snapshot: OwnedRoot[], errors: unknown[]): void => {
  for (const entry of snapshot) {
    if (!roots.has(entry)) continue
    try { entry.unmount() } catch (error) { errors.push(error) }
  }
}

// Synchronous public act flushes unmount effects before a fixture closes its DOM.
// There is one snapshot, never a drain/retry loop; new roots are rejected above.
export const disposeReactRootsForDocument = (document: Document): void => {
  const snapshot = [...roots].filter(entry => entry.document === document)
  if (!snapshot.length) return
  if (disposing) throw new Error('Reentrant React root disposal during test cleanup')
  disposing = true
  const errors: unknown[] = []
  let restore: (() => void) | undefined
  try {
    restore = enterOwnerContext(document)
    reactAct(() => unmountSnapshot(snapshot, errors))
  } catch (error) { errors.push(error) }
  finally {
    try { restore?.() } catch (error) { errors.push(error) }
    disposing = false
  }
  throwErrors(errors)
}

export const disposeRemainingReactRoots = async (): Promise<void> => {
  const snapshot = [...roots]
  if (!snapshot.length) return
  if (disposing) throw new Error('Reentrant React root disposal during test cleanup')
  disposing = true
  const errors: unknown[] = []
  try {
    const documents = new Set(snapshot.map(entry => entry.document))
    for (const document of documents) {
      let restore: (() => void) | undefined
      try {
        restore = enterOwnerContext(document)
        await reactAct(async () => unmountSnapshot(snapshot.filter(entry => entry.document === document), errors))
      } catch (error) { errors.push(error) }
      finally {
        try { restore?.() } catch (error) { errors.push(error) }
      }
    }
    if (roots.size) errors.push(new Error(`${roots.size} React root(s) remain after the test cleanup snapshot`))
  } finally { disposing = false }
  throwErrors(errors)
}
