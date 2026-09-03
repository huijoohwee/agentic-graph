import {
  AGENTIC_OS_GIT_OBJECT_FORMAT,
  type AgenticGraphGitCommitRequest,
  type AgenticGraphGitObjectRecord,
  type AgenticGraphGitPersistedCache,
  type AgenticGraphGitRefRecord,
  type AgenticGraphGitRelayFetchResult,
  type AgenticGraphGitRelayObject,
  type AgenticGraphGitRemoteRequest,
  type AgenticGraphGitRepositoryRecord,
  type AgenticGraphGitResolvedDocument,
} from './agentic-graph-git-contracts'
import {
  buildGitCommitBody,
  decodeGitBytesBase64,
  encodeGitBytesBase64,
  encodeGitTree,
  hashGitObject,
  normalizeGitObjectId,
  normalizeGitRefName,
  parseGitCommitHeader,
  parseGitTree,
  verifyGitRelayObject,
  type AgenticGraphGitTreeEntry,
} from './agentic-graph-git-object-codec'
import {
  isForbiddenAgenticGraphGitPath,
  isSupportedAgenticGraphGitDocumentPath,
  joinAgenticGraphGitPath as joinPath,
  normalizeAgenticGraphGitPath,
} from './agentic-graph-git-path'

export {
  deriveAgenticGraphGitRepositoryPathScope,
  isForbiddenAgenticGraphGitPath,
  normalizeAgenticGraphGitPath,
} from './agentic-graph-git-path'

type ObjectMap = Map<string, AgenticGraphGitObjectRecord>
const normalizeIdentityPart = (value: unknown, label: string): string => {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.includes('\0')) throw new Error(`${label} is required`)
  return normalized
}
export const buildAgenticGraphGitObjectRecordId = (
  workspaceId: string,
  repositoryId: string,
  objectId: string,
): string => `${workspaceId}\0${repositoryId}\0${objectId}`
export const buildAgenticGraphGitRefRecordId = (
  workspaceId: string,
  repositoryId: string,
  refName: string,
): string => `${workspaceId}\0${repositoryId}\0${refName}`
export const buildAgenticGraphGitRepositoryRecordId = (
  workspaceId: string,
  repositoryId: string,
): string => `${workspaceId}\0${repositoryId}`
export const buildAgenticGraphGitRemoteTrackingRefName = (
  remoteIdValue: unknown, branchRefNameValue: unknown,
): string => {
  const remoteId = normalizeIdentityPart(remoteIdValue, 'remoteId')
  const branchRefName = normalizeGitRefName(branchRefNameValue)
  if (!branchRefName.startsWith('refs/heads/')) throw new Error('Remote tracking requires a branch ref')
  const encodedRemoteId = encodeGitBytesBase64(new TextEncoder().encode(remoteId))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  return normalizeGitRefName(`refs/remotes/remote-${encodedRemoteId}/${branchRefName.slice('refs/heads/'.length)}`)
}

const toObjectRecord = (
  request: Pick<AgenticGraphGitRemoteRequest, 'workspaceId' | 'repositoryId'>,
  object: AgenticGraphGitRelayObject,
  body: Uint8Array,
  nowMs: number,
): AgenticGraphGitObjectRecord => ({
  id: buildAgenticGraphGitObjectRecordId(request.workspaceId, request.repositoryId, object.objectId),
  workspaceId: request.workspaceId,
  repositoryId: request.repositoryId,
  objectId: object.objectId,
  objectFormat: AGENTIC_OS_GIT_OBJECT_FORMAT,
  objectType: object.objectType,
  bodyBase64: encodeGitBytesBase64(body),
  byteLength: body.byteLength,
  updatedAtMs: nowMs,
})

const readObjectBody = (record: AgenticGraphGitObjectRecord): Uint8Array => {
  const body = decodeGitBytesBase64(record.bodyBase64)
  if (body.byteLength !== record.byteLength) throw new Error(`Git object ${record.objectId} is truncated`)
  return body
}

const readRequiredObject = (objects: ObjectMap, objectId: string): AgenticGraphGitObjectRecord => {
  const normalized = normalizeGitObjectId(objectId)
  const record = objects.get(normalized)
  if (!record) throw new Error(`Git object graph is missing ${normalized}`)
  return record
}

const walkTree = (
  objects: ObjectMap,
  treeObjectId: string,
  pathPrefix: string,
  canonicalPathScope: string,
  visited: Set<string>,
): number => {
  const tree = readRequiredObject(objects, treeObjectId)
  if (tree.objectType !== 'tree') throw new Error(`Git object ${tree.objectId} is not a tree`)
  if (visited.has(tree.objectId)) throw new Error('Git tree graph contains a cycle')
  visited.add(tree.objectId)
  const entries = parseGitTree(readObjectBody(tree))
  let blobCount = 0
  for (const entry of entries) {
    const path = joinPath(pathPrefix, entry.name)
    const canonicalPath = joinPath(canonicalPathScope, path)
    if (isForbiddenAgenticGraphGitPath(canonicalPath)) {
      throw new Error(`Git tree targets unsupported path ${canonicalPath}`)
    }
    const child = readRequiredObject(objects, entry.objectId)
    if (entry.mode === '40000') {
      if (child.objectType !== 'tree') throw new Error(`Git tree entry ${path} does not target a tree`)
      blobCount += walkTree(objects, child.objectId, path, canonicalPathScope, visited)
    } else {
      if (child.objectType !== 'blob') throw new Error(`Git tree entry ${path} does not target a blob`)
      blobCount += 1
    }
  }
  visited.delete(tree.objectId)
  return blobCount
}

const validateCommitGraph = (
  objects: ObjectMap,
  commitObjectId: string,
  canonicalPathScope: string,
  visitedCommits: Set<string>,
): number => {
  const commit = readRequiredObject(objects, commitObjectId)
  if (commit.objectType !== 'commit') throw new Error(`Git ref target ${commit.objectId} is not a commit`)
  if (visitedCommits.has(commit.objectId)) throw new Error('Git commit graph contains a cycle')
  visitedCommits.add(commit.objectId)
  const header = parseGitCommitHeader(readObjectBody(commit))
  const blobCount = walkTree(objects, header.treeObjectId, '', canonicalPathScope, new Set())
  for (const parentObjectId of header.parentObjectIds) {
    validateCommitGraph(objects, parentObjectId, canonicalPathScope, visitedCommits)
  }
  visitedCommits.delete(commit.objectId)
  return blobCount
}

const verifyStoredObjects = async (
  cache: AgenticGraphGitPersistedCache,
  records: AgenticGraphGitObjectRecord[],
): Promise<void> => {
  for (const record of records) {
    const stored = await cache.getObject(record.workspaceId, record.repositoryId, record.objectId)
    if (
      !stored
      || stored.objectType !== record.objectType
      || stored.bodyBase64 !== record.bodyBase64
      || stored.byteLength !== record.byteLength
    ) {
      throw new Error(`Git object ${record.objectId} was not durably materialized`)
    }
  }
}

const verifyStoredRefs = async (
  cache: AgenticGraphGitPersistedCache,
  records: AgenticGraphGitRefRecord[],
): Promise<void> => {
  for (const record of records) {
    const stored = await cache.getRef(record.workspaceId, record.repositoryId, record.refName)
    if (!stored || stored.targetKind !== record.targetKind || stored.target !== record.target) {
      throw new Error(`Git ref ${record.refName} was not durably materialized`)
    }
  }
}

export const materializeAgenticGraphGitFetch = async (args: {
  cache: AgenticGraphGitPersistedCache
  request: AgenticGraphGitRemoteRequest
  response: AgenticGraphGitRelayFetchResult
  mode: 'clone' | 'fetch' | 'remote-save'
  expectedCommit?: { parentObjectId: string | null; treeObjectId: string }
  nowMs: number
}): Promise<{ headObjectId: string; objectsReused: number }> => {
  const workspaceId = normalizeIdentityPart(args.request.workspaceId, 'workspaceId')
  const repositoryId = normalizeIdentityPart(args.request.repositoryId, 'repositoryId')
  const remoteId = normalizeIdentityPart(args.request.remoteId, 'remoteId')
  const canonicalPathScope = normalizeAgenticGraphGitPath(args.request.canonicalPathScope)
  const refName = normalizeGitRefName(args.request.refName)
  const headRefName = normalizeGitRefName(args.response.headRefName)
  if (args.response.refs.length === 0) throw new Error('Empty Git repositories are not supported')

  const existingRecords = await args.cache.listObjects(workspaceId, repositoryId)
  for (const existing of existingRecords) {
    if (existing.objectFormat !== AGENTIC_OS_GIT_OBJECT_FORMAT) {
      throw new Error(`Git object ${existing.objectId} uses an unsupported object format`)
    }
    await verifyGitRelayObject({
      objectId: existing.objectId,
      objectType: existing.objectType,
      bodyBase64: existing.bodyBase64,
      byteLength: existing.byteLength,
    })
  }
  const objects: ObjectMap = new Map(existingRecords.map(record => [record.objectId, record]))
  const existingIds = new Set(objects.keys())
  const incomingRecords: AgenticGraphGitObjectRecord[] = []
  const incomingIds = new Set<string>()
  for (const object of args.response.objects) {
    const verified = await verifyGitRelayObject(object)
    if (existingIds.has(verified.objectId)) {
      throw new Error(`Git relay re-sent cached object ${verified.objectId}`)
    }
    if (incomingIds.has(verified.objectId)) throw new Error(`Git relay duplicated object ${verified.objectId}`)
    incomingIds.add(verified.objectId)
    const record = toObjectRecord({ workspaceId, repositoryId }, object, verified.body, args.nowMs)
    incomingRecords.push(record)
    objects.set(record.objectId, record)
  }

  const returnedRefNames = new Set<string>()
  const refRecords: AgenticGraphGitRefRecord[] = args.response.refs.map(ref => {
    const nextRefName = normalizeGitRefName(ref.refName)
    if (returnedRefNames.has(nextRefName)) throw new Error(`Git relay duplicated ref ${nextRefName}`)
    returnedRefNames.add(nextRefName)
    const target = ref.targetKind === 'direct'
      ? normalizeGitObjectId(ref.target)
      : normalizeGitRefName(ref.target)
    return {
      id: buildAgenticGraphGitRefRecordId(workspaceId, repositoryId, nextRefName),
      workspaceId,
      repositoryId,
      refName: nextRefName,
      targetKind: ref.targetKind,
      target,
      remoteId,
      updatedAtMs: args.nowMs,
    }
  })
  const refByName = new Map(refRecords.map(record => [record.refName, record]))
  const head = refByName.get(headRefName)
  if (!head) throw new Error('Git relay did not return its declared HEAD ref')
  const requestedRef = refByName.get(refName)
  if (!requestedRef || requestedRef.targetKind !== 'direct') {
    throw new Error(`Git relay did not return requested direct ref ${refName}`)
  }
  const resolvedHead = head.targetKind === 'symbolic' ? refByName.get(head.target) : head
  if (
    !resolvedHead
    || resolvedHead.targetKind !== 'direct'
    || resolvedHead.target !== requestedRef.target
    || (head.targetKind === 'symbolic' && head.target !== refName)
  ) {
    throw new Error('Git relay HEAD does not resolve to a direct ref')
  }
  const remoteTrackingRefName = buildAgenticGraphGitRemoteTrackingRefName(remoteId, refName)
  if (refByName.has(remoteTrackingRefName)) throw new Error('Git relay returned a reserved tracking ref')
  const remoteTrackingRef: AgenticGraphGitRefRecord = {
    id: buildAgenticGraphGitRefRecordId(workspaceId, repositoryId, remoteTrackingRefName),
    workspaceId,
    repositoryId,
    refName: remoteTrackingRefName,
    targetKind: 'direct',
    target: requestedRef.target,
    remoteId,
    updatedAtMs: args.nowMs,
  }
  refRecords.push(remoteTrackingRef); refByName.set(remoteTrackingRefName, remoteTrackingRef)
  for (const record of refRecords) {
    if (record.targetKind === 'symbolic' && !refByName.has(record.target)) {
      throw new Error(`Git symbolic ref ${record.refName} targets a missing ref`)
    }
    if (record.targetKind === 'direct') {
      readRequiredObject(objects, record.target)
      if (record.refName.startsWith('refs/heads/') || record.refName.startsWith('refs/remotes/')) {
        validateCommitGraph(objects, record.target, canonicalPathScope, new Set())
      }
    }
  }
  const blobCount = validateCommitGraph(
    objects,
    resolvedHead.target,
    canonicalPathScope,
    new Set(),
  )
  if (blobCount === 0) throw new Error('Empty Git repositories are not supported')
  if (args.expectedCommit) {
    const header = parseGitCommitHeader(readObjectBody(readRequiredObject(objects, resolvedHead.target)))
    let chainObjectId = resolvedHead.target
    let reachesExpectedBoundary = false
    for (;;) {
      if (args.expectedCommit.parentObjectId && chainObjectId === args.expectedCommit.parentObjectId) {
        reachesExpectedBoundary = true
        break
      }
      const chainHeader = parseGitCommitHeader(
        readObjectBody(readRequiredObject(objects, chainObjectId)),
      )
      if (chainHeader.parentObjectIds.length > 1) break
      const parent = chainHeader.parentObjectIds[0]
      if (!parent) {
        reachesExpectedBoundary = args.expectedCommit.parentObjectId === null
        break
      }
      chainObjectId = parent
    }
    if (
      header.treeObjectId !== args.expectedCommit.treeObjectId
      || resolvedHead.target === args.expectedCommit.parentObjectId
      || !reachesExpectedBoundary
    ) throw new Error('Git remote commit does not match the dispatched save')
  }

  await args.cache.putObjects(incomingRecords)
  await verifyStoredObjects(args.cache, incomingRecords)
  const persistedRefs = args.mode === 'fetch'
    ? [remoteTrackingRef]
    : Array.from(new Map(
        [head, requestedRef, remoteTrackingRef].map(record => [record.refName, record]),
      ).values())
  await args.cache.putRefs(persistedRefs)
  await verifyStoredRefs(args.cache, persistedRefs)
  const repository: AgenticGraphGitRepositoryRecord = {
    id: buildAgenticGraphGitRepositoryRecordId(workspaceId, repositoryId),
    workspaceId,
    repositoryId,
    remoteId,
    canonicalPathScope,
    headRefName: refName || headRefName,
    objectFormat: AGENTIC_OS_GIT_OBJECT_FORMAT,
    updatedAtMs: args.nowMs,
  }
  await args.cache.putRepository(repository)
  const storedRepository = await args.cache.getRepository(workspaceId, repositoryId)
  if (!storedRepository || storedRepository.headRefName !== repository.headRefName) {
    throw new Error('Git repository metadata was not durably materialized')
  }

  const reachableExistingIds = new Set<string>()
  const traversedIds = new Set<string>()
  const collectExisting = (objectId: string): void => {
    if (traversedIds.has(objectId)) return
    traversedIds.add(objectId)
    if (existingIds.has(objectId)) reachableExistingIds.add(objectId)
    const record = objects.get(objectId)
    if (!record) return
    if (record.objectType === 'commit') {
      const header = parseGitCommitHeader(readObjectBody(record))
      collectExisting(header.treeObjectId)
      header.parentObjectIds.forEach(collectExisting)
    } else if (record.objectType === 'tree') {
      parseGitTree(readObjectBody(record)).forEach(entry => collectExisting(entry.objectId))
    }
  }
  collectExisting(resolvedHead.target)
  return { headObjectId: resolvedHead.target, objectsReused: reachableExistingIds.size }
}

type TreeNode = {
  blobs: Map<string, { objectId: string; mode: '100644' | '100755' }>
  directories: Map<string, TreeNode>
}

const buildTreeObjects = async (
  workspaceId: string,
  repositoryId: string,
  node: TreeNode,
  nowMs: number,
  objects: Map<string, AgenticGraphGitObjectRecord>,
): Promise<string> => {
  const entries: AgenticGraphGitTreeEntry[] = []
  for (const [name, blob] of node.blobs) entries.push({ mode: blob.mode, name, objectId: blob.objectId })
  for (const [name, child] of node.directories) {
    entries.push({
      mode: '40000',
      name,
      objectId: await buildTreeObjects(workspaceId, repositoryId, child, nowMs, objects),
    })
  }
  const body = encodeGitTree(entries)
  const objectId = await hashGitObject('tree', body)
  if (!objects.has(objectId)) {
    objects.set(objectId, toObjectRecord(
      { workspaceId, repositoryId },
      { objectId, objectType: 'tree', bodyBase64: '', byteLength: body.byteLength },
      body,
      nowMs,
    ))
  }
  return objectId
}

const flattenGitTree = (
  objects: ObjectMap,
  treeObjectId: string,
  prefix: string,
  files: Map<string, { objectId: string; mode: '100644' | '100755' }>,
  visiting: Set<string>,
): void => {
  const tree = readRequiredObject(objects, treeObjectId)
  if (tree.objectType !== 'tree' || visiting.has(tree.objectId)) {
    throw new Error('Parent Git tree graph is invalid')
  }
  visiting.add(tree.objectId)
  for (const entry of parseGitTree(readObjectBody(tree))) {
    const path = joinPath(prefix, entry.name)
    const child = readRequiredObject(objects, entry.objectId)
    if (entry.mode === '40000') {
      if (child.objectType !== 'tree') throw new Error(`Git tree entry ${path} is not a tree`)
      flattenGitTree(objects, child.objectId, path, files, visiting)
    } else {
      if (child.objectType !== 'blob' || files.has(path)) {
        throw new Error(`Git tree entry ${path} is not a unique blob`)
      }
      files.set(path, { objectId: child.objectId, mode: entry.mode })
    }
  }
  visiting.delete(tree.objectId)
}

const pathWithinRepositoryScope = (path: string, scope: string): boolean =>
  !scope || path === scope || path.startsWith(`${scope}/`)

export const listAgenticGraphGitCommitDocumentPaths = (args: {
  commitObjectId: string
  objects: AgenticGraphGitObjectRecord[]
  repositoryPathScope: string
}): string[] => {
  const objects = new Map(args.objects.map(record => [record.objectId, record]))
  const commit = readRequiredObject(objects, args.commitObjectId)
  if (commit.objectType !== 'commit') throw new Error('Parent Git object is not a commit')
  const files = new Map<string, { objectId: string; mode: '100644' | '100755' }>()
  flattenGitTree(objects, parseGitCommitHeader(readObjectBody(commit)).treeObjectId, '', files, new Set())
  return [...files.keys()]
    .filter(path => pathWithinRepositoryScope(path, args.repositoryPathScope))
    .filter(isSupportedAgenticGraphGitDocumentPath)
    .sort()
}

const addTreeFile = (
  root: TreeNode,
  repositoryPath: string,
  file: { objectId: string; mode: '100644' | '100755' },
): void => {
  const segments = normalizeAgenticGraphGitPath(repositoryPath).split('/')
  let node = root
  for (const segment of segments.slice(0, -1)) {
    if (node.blobs.has(segment)) throw new Error(`Git path ${repositoryPath} collides with a file`)
    let child = node.directories.get(segment)
    if (!child) {
      child = { blobs: new Map(), directories: new Map() }
      node.directories.set(segment, child)
    }
    node = child
  }
  const name = segments.at(-1)!
  if (node.blobs.has(name) || node.directories.has(name)) {
    throw new Error(`Git path ${repositoryPath} is duplicated`)
  }
  node.blobs.set(name, file)
}

export const buildAgenticGraphGitCommitObjects = async (args: {
  request: AgenticGraphGitCommitRequest
  documents: AgenticGraphGitResolvedDocument[]
  parentObjectId: string | null
  parentObjects?: AgenticGraphGitObjectRecord[]
  repositoryPathScope?: string
  nowMs: number
}): Promise<{
  objects: AgenticGraphGitObjectRecord[]
  treeObjectId: string
  commitObjectId: string
}> => {
  const root: TreeNode = { blobs: new Map(), directories: new Map() }
  const objects = new Map<string, AgenticGraphGitObjectRecord>()
  const files = new Map<string, { objectId: string; mode: '100644' | '100755' }>()
  if (args.parentObjectId) {
    if (!args.parentObjects || args.repositoryPathScope == null) {
      throw new Error('Parent Git tree and repository scope are required')
    }
    const parentObjects = new Map(args.parentObjects.map(record => [record.objectId, record]))
    const parent = readRequiredObject(parentObjects, args.parentObjectId)
    if (parent.objectType !== 'commit') throw new Error('Parent Git object is not a commit')
    const parentHeader = parseGitCommitHeader(readObjectBody(parent))
    flattenGitTree(parentObjects, parentHeader.treeObjectId, '', files, new Set())
    const scope = args.repositoryPathScope
    for (const path of files.keys()) {
      if (pathWithinRepositoryScope(path, scope) && isSupportedAgenticGraphGitDocumentPath(path)) {
        files.delete(path)
      }
    }
  }
  for (const document of args.documents) {
    const repositoryPath = normalizeAgenticGraphGitPath(document.repositoryPath)
    const body = new TextEncoder().encode(document.text)
    const objectId = await hashGitObject('blob', body)
    files.set(repositoryPath, { objectId, mode: '100644' })
    if (!objects.has(objectId)) {
      objects.set(objectId, toObjectRecord(
        { workspaceId: args.request.workspaceId, repositoryId: args.request.repositoryId },
        { objectId, objectType: 'blob', bodyBase64: '', byteLength: body.byteLength },
        body,
        args.nowMs,
      ))
    }
  }
  for (const [repositoryPath, file] of files) addTreeFile(root, repositoryPath, file)
  const treeObjectId = await buildTreeObjects(
    args.request.workspaceId,
    args.request.repositoryId,
    root,
    args.nowMs,
    objects,
  )
  const commitBody = buildGitCommitBody({
    treeObjectId,
    parentObjectId: args.parentObjectId,
    author: args.request.author,
    committer: args.request.committer,
    message: args.request.message,
  })
  const commitObjectId = await hashGitObject('commit', commitBody)
  objects.set(commitObjectId, toObjectRecord(
    { workspaceId: args.request.workspaceId, repositoryId: args.request.repositoryId },
    {
      objectId: commitObjectId,
      objectType: 'commit',
      bodyBase64: '',
      byteLength: commitBody.byteLength,
    },
    commitBody,
    args.nowMs,
  ))
  return { objects: Array.from(objects.values()), treeObjectId, commitObjectId }
}

export const persistAgenticGraphGitCommit = async (args: {
  cache: AgenticGraphGitPersistedCache
  request: AgenticGraphGitCommitRequest
  objects: AgenticGraphGitObjectRecord[]
  commitObjectId: string
  nowMs: number
}): Promise<void> => {
  await args.cache.putObjects(args.objects)
  await verifyStoredObjects(args.cache, args.objects)
  const refName = normalizeGitRefName(args.request.refName)
  const ref: AgenticGraphGitRefRecord = {
    id: buildAgenticGraphGitRefRecordId(args.request.workspaceId, args.request.repositoryId, refName),
    workspaceId: args.request.workspaceId,
    repositoryId: args.request.repositoryId,
    refName,
    targetKind: 'direct',
    target: normalizeGitObjectId(args.commitObjectId),
    remoteId: args.request.remoteId,
    updatedAtMs: args.nowMs,
  }
  await args.cache.putRefs([ref])
  await verifyStoredRefs(args.cache, [ref])
}

export const listReachableAgenticGraphGitObjects = async (args: {
  cache: AgenticGraphGitPersistedCache
  workspaceId: string
  repositoryId: string
  commitObjectId: string
}): Promise<AgenticGraphGitObjectRecord[]> => {
  const all = await args.cache.listObjects(args.workspaceId, args.repositoryId)
  const objects = new Map(all.map(record => [record.objectId, record]))
  const reachable = new Map<string, AgenticGraphGitObjectRecord>()
  const visit = (objectId: string): void => {
    if (reachable.has(objectId)) return
    const record = readRequiredObject(objects, objectId)
    reachable.set(record.objectId, record)
    if (record.objectType === 'commit') {
      const header = parseGitCommitHeader(readObjectBody(record))
      visit(header.treeObjectId)
      header.parentObjectIds.forEach(visit)
    } else if (record.objectType === 'tree') {
      parseGitTree(readObjectBody(record)).forEach(entry => visit(entry.objectId))
    }
  }
  visit(normalizeGitObjectId(args.commitObjectId))
  const records = Array.from(reachable.values())
  for (const record of records) {
    await verifyGitRelayObject({
      objectId: record.objectId,
      objectType: record.objectType,
      bodyBase64: record.bodyBase64,
      byteLength: record.byteLength,
    })
  }
  return records
}
