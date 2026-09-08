import Dexie from 'dexie'
import { IDBKeyRange, indexedDB as fakeIndexedDB } from 'fake-indexeddb'
import { __resetAgenticGraphStorageDbForTests } from '@/lib/storage/agentic-graph-storage-db'

type MutableStorageGlobals = typeof globalThis & { indexedDB?: IDBFactory, IDBKeyRange?: typeof globalThis.IDBKeyRange }

export const withDurableBrowserStorage = async <Result,>(callback: () => Promise<Result>): Promise<Result> => {
  const root = globalThis as MutableStorageGlobals
  const prior = [process.env.NODE_ENV, process.env.AG_TEST_QUIET, root.indexedDB, root.IDBKeyRange, Dexie.dependencies.indexedDB, Dexie.dependencies.IDBKeyRange] as const
  try {
    process.env.NODE_ENV = 'development'
    process.env.AG_TEST_QUIET = '0'
    root.indexedDB = fakeIndexedDB
    root.IDBKeyRange = IDBKeyRange
    Dexie.dependencies.indexedDB = fakeIndexedDB
    Dexie.dependencies.IDBKeyRange = IDBKeyRange
    await __resetAgenticGraphStorageDbForTests()
    return await callback()
  } finally {
    await __resetAgenticGraphStorageDbForTests()
    if (prior[0] === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = prior[0]
    if (prior[1] === undefined) delete process.env.AG_TEST_QUIET
    else process.env.AG_TEST_QUIET = prior[1]
    if (prior[2] === undefined) delete root.indexedDB
    else root.indexedDB = prior[2]
    if (prior[3] === undefined) delete root.IDBKeyRange
    else root.IDBKeyRange = prior[3]
    Dexie.dependencies.indexedDB = prior[4]
    Dexie.dependencies.IDBKeyRange = prior[5]
  }
}

