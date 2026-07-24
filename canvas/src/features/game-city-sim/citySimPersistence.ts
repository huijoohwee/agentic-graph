import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { createWorkspaceFsMutationTransaction } from '@/features/workspace-fs/workspaceFsMutationTransaction'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { upsertWorkspaceTextDocument } from '@/features/workspace-fs/upsertWorkspaceTextDocument'
import {
  cityGridReadBackEquals,
  parseCityGridDocument,
  serializeCityGridDocument,
  verifyCityGridRoundTrip,
  type CityGridParseError,
} from './citySimCodec'
import {
  CITY_SIM_DOCUMENT_PATH,
  type CityGrid,
} from './citySimModel'

const CITY_SIM_DOCUMENT_FOLDER = '/game-city-sim'
const CITY_SIM_DOCUMENT_NAME = 'city-grid.md'

export class CitySimPersistenceError extends Error {
  readonly code: 'workspace-read' | 'workspace-write' | 'read-back-mismatch'

  constructor(
    code: CitySimPersistenceError['code'],
    message: string,
  ) {
    super(message)
    this.name = 'CitySimPersistenceError'
    this.code = code
  }
}

export type CityGridLoadResult =
  | Readonly<{ status: 'missing'; path: typeof CITY_SIM_DOCUMENT_PATH }>
  | Readonly<{
      status: 'loaded'
      path: typeof CITY_SIM_DOCUMENT_PATH
      document: string
      city: CityGrid
    }>
  | Readonly<{
      status: 'malformed'
      path: typeof CITY_SIM_DOCUMENT_PATH
      document: string
      error: CityGridParseError
    }>

export type CityGridSaveResult = Readonly<{
  status: 'saved'
  path: typeof CITY_SIM_DOCUMENT_PATH
  document: string
  city: CityGrid
}>

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error || 'Workspace persistence failed')
}

export async function loadCityGridFromWorkspace(
  options: Readonly<{ workspace?: WorkspaceFs }> = {},
): Promise<CityGridLoadResult> {
  try {
    const workspace = options.workspace ?? await getWorkspaceFs()
    await workspace.ensureSeed()
    const document = await workspace.readFileText(CITY_SIM_DOCUMENT_PATH)
    if (document == null) {
      return Object.freeze({
        status: 'missing',
        path: CITY_SIM_DOCUMENT_PATH,
      })
    }
    const parsed = parseCityGridDocument(document)
    if (parsed.ok === false) {
      return Object.freeze({
        status: 'malformed',
        path: CITY_SIM_DOCUMENT_PATH,
        document,
        error: parsed.error,
      })
    }
    return Object.freeze({
      status: 'loaded',
      path: CITY_SIM_DOCUMENT_PATH,
      document,
      city: parsed.city,
    })
  } catch (error) {
    throw new CitySimPersistenceError(
      'workspace-read',
      `City document could not be read: ${errorMessage(error)}`,
    )
  }
}

export async function saveCityGridToWorkspace(
  city: CityGrid,
  options: Readonly<{ workspace?: WorkspaceFs }> = {},
): Promise<CityGridSaveResult> {
  const roundTrip = verifyCityGridRoundTrip(city)
  if (roundTrip.ok === false) {
    throw new CitySimPersistenceError(
      'read-back-mismatch',
      `City document could not be serialized safely: ${roundTrip.error.message}`,
    )
  }
  const workspace = options.workspace ?? await getWorkspaceFs()
  await workspace.ensureSeed()
  const transaction = createWorkspaceFsMutationTransaction(workspace)
  try {
    await ensureWorkspaceFolderTreeIfMissing({
      fs: transaction.fs,
      folderPath: CITY_SIM_DOCUMENT_FOLDER,
    })
    await upsertWorkspaceTextDocument({
      fs: transaction.fs,
      parentPath: CITY_SIM_DOCUMENT_FOLDER,
      name: CITY_SIM_DOCUMENT_NAME,
      text: roundTrip.document,
    })
    const readBackDocument = await transaction.fs.readFileText(CITY_SIM_DOCUMENT_PATH)
    if (readBackDocument !== roundTrip.document) {
      throw new CitySimPersistenceError(
        'read-back-mismatch',
        'City save read-back bytes did not match the committed snapshot.',
      )
    }
    const parsed = parseCityGridDocument(readBackDocument)
    if (parsed.ok === false) {
      throw new CitySimPersistenceError(
        'read-back-mismatch',
        `City save read-back was malformed: ${parsed.error.message}`,
      )
    }
    if (!cityGridReadBackEquals(city, parsed.city)) {
      throw new CitySimPersistenceError(
        'read-back-mismatch',
        'City save read-back state did not match the committed snapshot.',
      )
    }
    return Object.freeze({
      status: 'saved',
      path: CITY_SIM_DOCUMENT_PATH,
      document: readBackDocument,
      city: parsed.city,
    })
  } catch (error) {
    let rollbackError: unknown = null
    try {
      await transaction.rollback()
    } catch (caughtRollbackError) {
      rollbackError = caughtRollbackError
    }
    const message = rollbackError
      ? `${errorMessage(error)} Rollback also failed: ${errorMessage(rollbackError)}`
      : errorMessage(error)
    if (error instanceof CitySimPersistenceError && !rollbackError) throw error
    throw new CitySimPersistenceError('workspace-write', `City save failed: ${message}`)
  }
}

export function serializeCityGridForPersistence(city: CityGrid): string {
  return serializeCityGridDocument(city)
}
