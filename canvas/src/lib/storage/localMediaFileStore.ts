import Dexie, { type Table } from 'dexie'

export type LocalMediaFileRecord = {
  id: string
  keys: string[]
  blob: Blob
  name: string
  lastModified: number
}

/** Device-local binary storage; object URLs are recreated by the runtime owner. */
export function createLocalMediaFileStore(databaseName = 'agentic-graph-local-media-files') {
  const database = new Dexie(databaseName)
  database.version(1).stores({ files: '&id, *keys' })
  const files: Table<LocalMediaFileRecord, string> = database.table('files')
  return {
    async write(records: readonly LocalMediaFileRecord[]): Promise<void> {
      if (records.length) await files.bulkPut([...records])
    },
    async read(keys: readonly string[]): Promise<LocalMediaFileRecord[]> {
      return keys.length ? files.where('keys').anyOf([...keys]).distinct().toArray() : []
    },
    close: () => database.close(),
  }
}

let localMediaFiles: ReturnType<typeof createLocalMediaFileStore> | null = null
const getLocalMediaFiles = () => localMediaFiles ||= createLocalMediaFileStore()
export const writeLocalMediaFiles = (records: readonly LocalMediaFileRecord[]) => getLocalMediaFiles().write(records)
export const readLocalMediaFiles = (keys: readonly string[]) => getLocalMediaFiles().read(keys)
