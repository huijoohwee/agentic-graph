import Dexie, { type Table } from 'dexie'

export type LocalMediaFileRecord = {
  id: string
  keys: string[]
  blob: Blob
  name: string
  relativePath?: string
  lastModified: number
}

/** Device-local binary storage; object URLs are recreated by the runtime owner. */
export function createLocalMediaFileStore(databaseName = 'agentic-graph-local-media-files') {
  const database = new Dexie(databaseName)
  database.version(1).stores({ files: '&id, *keys' })
  const files: Table<LocalMediaFileRecord, string> = database.table('files')
  return {
    async write(records: readonly LocalMediaFileRecord[]): Promise<void> {
      if (!records.length) return
      await database.transaction('rw', files, async () => {
        for (const record of records) {
          const overlapping = await files.where('keys').anyOf(record.keys).distinct().toArray()
          const claimed = new Set(record.keys)
          for (const previous of overlapping) {
            if (previous.id !== record.id) await files.update(previous.id, { keys: previous.keys.filter(key => !claimed.has(key)) })
          }
          await files.put(record)
        }
      })
    },
    async read(keys: readonly string[]): Promise<{ records: LocalMediaFileRecord[]; ambiguousKeys: string[] }> {
      const records = keys.length ? await files.where('keys').anyOf([...keys]).distinct().toArray() : []
      const owners = new Map<string, string | null>()
      for (const record of records) for (const key of record.keys) {
        owners.set(key, owners.has(key) && owners.get(key) !== record.id ? null : record.id)
      }
      return { records, ambiguousKeys: [...owners].filter(([, id]) => id === null).map(([key]) => key) }
    },
    close: () => database.close(),
  }
}

let localMediaFiles: ReturnType<typeof createLocalMediaFileStore> | null = null
const getLocalMediaFiles = () => localMediaFiles ||= createLocalMediaFileStore()
export const writeLocalMediaFiles = (records: readonly LocalMediaFileRecord[]) => getLocalMediaFiles().write(records)
export const readLocalMediaFiles = (keys: readonly string[]) => getLocalMediaFiles().read(keys)
