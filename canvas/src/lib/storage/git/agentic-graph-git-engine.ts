import {
  AGENTIC_OS_GIT_OBJECT_FORMAT,
  AGENTIC_OS_GIT_OPERATION_BOUNDS,
  AgenticGraphGitAuthorityError,
  AgenticGraphGitRelayError,
  type AgenticGraphGitCommitRequest,
  type AgenticGraphGitEngineDependencies,
  type AgenticGraphGitOperationOutboxRecord,
  type AgenticGraphGitOperationResult,
  type AgenticGraphGitPushRequest,
  type AgenticGraphGitQueuedRequest,
  type AgenticGraphGitRefRecord,
  type AgenticGraphGitRemoteRequest,
  type AgenticGraphGitStorageMode,
} from './agentic-graph-git-contracts'
import { decodeGitBytesBase64, normalizeGitObjectId } from './agentic-graph-git-object-codec'
import { resolveAgenticGraphGitDocumentDeletions } from './agentic-graph-git-deletion'
import {
  buildAgenticGraphGitCommitObjects,
  buildAgenticGraphGitRefRecordId,
  buildAgenticGraphGitRemoteTrackingRefName,
  buildAgenticGraphGitRepositoryRecordId,
  listReachableAgenticGraphGitObjects,
  materializeAgenticGraphGitFetch,
  persistAgenticGraphGitCommit,
} from './agentic-graph-git-repository'
import {
  defaultGitOperationId,
  defaultGitSleep,
  fixedGitOperationMessage,
  gitBackoffDelay,
  GitOperationAuthError,
  GitOperationBudget,
  GitOperationIntegrityError,
  GitOperationLimitError,
  GitOperationRetryExhaustedError,
  isRetryableGitNetworkError,
  normalizeGitRemoteRequest,
  normalizeOpaqueGitId,
  preflightAgenticGraphGitDocuments,
  UnsupportedGitPathError,
} from './agentic-graph-git-engine-support'
import { acknowledgeMaterializedAgenticGraphGitClone } from './agentic-graph-git-recovery'

export const createAgenticGraphGitEngine = (dependencies: AgenticGraphGitEngineDependencies) => {
  const now = dependencies.now || Date.now
  const idFactory = dependencies.idFactory || defaultGitOperationId
  const sleep = dependencies.sleep || defaultGitSleep
  const deviceId = normalizeOpaqueGitId(dependencies.deviceId, 'deviceId')
  const claimOwner = `${deviceId}:engine:${defaultGitOperationId()}`
  const claimLeaseMs = 5 * 60_000
  const drainByWorkspace = new Map<string, Promise<AgenticGraphGitOperationResult[]>>()

  const enqueue = async (request: AgenticGraphGitQueuedRequest): Promise<AgenticGraphGitOperationOutboxRecord> => {
    const createdAtMs = now()
    return dependencies.cache.appendOutbox({
      id: idFactory(),
      workspaceId: request.workspaceId,
      deviceId,
      entity: 'gitOperation',
      kind: request.kind,
      request,
      attemptCount: 0,
      lastStatus: 'queued',
      lastMessage: null,
      createdAtMs,
      updatedAtMs: createdAtMs,
    })
  }

  const reportFailure = async (
    record: AgenticGraphGitOperationOutboxRecord,
    claimToken: string,
    status: 'limit-exceeded' | 'conflict' | 'auth-failure' | 'retry-exhausted' | 'invalid-remote',
  ): Promise<AgenticGraphGitOperationResult> => {
    const message = fixedGitOperationMessage(record.kind, status)
    if (!await dependencies.cache.patchClaimedOutbox(record.id, claimToken, {
      lastStatus: status,
      lastMessage: message,
      updatedAtMs: now(),
    }, true)) throw new GitOperationIntegrityError('Git outbox claim was lost')
    await dependencies.reportIssue?.({
      workspaceId: record.workspaceId,
      operationId: record.id,
      kind: record.kind,
      issue: status,
      message,
    })
    return { status, operationId: record.id, kind: record.kind, message }
  }

  const runWithRetry = async <Result>(
    record: AgenticGraphGitOperationOutboxRecord,
    claimToken: string,
    budget: GitOperationBudget,
    operation: (attemptIndex: number, signal: AbortSignal) => Promise<Result>,
  ): Promise<Result> => {
    for (let attemptIndex = 0; attemptIndex < AGENTIC_OS_GIT_OPERATION_BOUNDS.maxAttempts; attemptIndex += 1) {
      budget.assertWithinBounds()
      if (!await dependencies.cache.patchClaimedOutbox(record.id, claimToken, {
        attemptCount: attemptIndex + 1,
        updatedAtMs: now(),
      })) throw new GitOperationIntegrityError('Git outbox claim was lost')
      try {
        return await budget.waitFor(operation(attemptIndex, budget.controller.signal))
      } catch (error) {
        if (error instanceof Error && error.message === 'persistence-unavailable') throw error
        if (error instanceof AgenticGraphGitRelayError && error.transferBytes > 0) {
          budget.consumeBytes(error.transferBytes)
        }
        if (error instanceof GitOperationLimitError) throw error
        if (error instanceof AgenticGraphGitRelayError && error.code === 'limit-exceeded') {
          throw new GitOperationLimitError('Git relay bounds exceeded')
        }
        if (error instanceof AgenticGraphGitRelayError && error.code === 'auth-failure') {
          throw new GitOperationAuthError('Git authentication failed')
        }
        if (error instanceof AgenticGraphGitAuthorityError && error.code === 'auth-failure') {
          throw new GitOperationAuthError('Git document authority authentication failed')
        }
        if (error instanceof AgenticGraphGitRelayError && error.code === 'invalid-response') {
          throw new GitOperationIntegrityError('Git relay response is invalid')
        }
        if (error instanceof AgenticGraphGitAuthorityError && error.code === 'invalid-response') {
          throw new GitOperationIntegrityError('Git document authority response is invalid')
        }
        if (!isRetryableGitNetworkError(error)) throw new GitOperationIntegrityError('Git operation failed closed')
        if (attemptIndex + 1 >= AGENTIC_OS_GIT_OPERATION_BOUNDS.maxAttempts) break
        await budget.waitFor(sleep(gitBackoffDelay(attemptIndex), budget.controller.signal))
        budget.assertWithinBounds()
      }
    }
    throw new GitOperationRetryExhaustedError('Git retry budget exhausted')
  }

  const executeFetch = async (
    record: AgenticGraphGitOperationOutboxRecord,
    claimToken: string,
    request: ({ kind: 'clone' | 'fetch' } & AgenticGraphGitRemoteRequest),
    budget: GitOperationBudget,
  ): Promise<AgenticGraphGitOperationResult> => {
    if (request.kind === 'clone') {
      const recovered = await acknowledgeMaterializedAgenticGraphGitClone({
        cache: dependencies.cache,
        request,
        operationId: record.id,
        claimToken,
      })
      if (recovered) {
        return {
          status: 'complete',
          operationId: record.id,
          kind: 'clone',
          objectId: recovered.headObjectId,
          objectsReused: recovered.objectsReused,
        }
      }
    }
    const knownObjects = await dependencies.cache.listObjects(request.workspaceId, request.repositoryId)
    const response = await runWithRetry(record, claimToken, budget, (_attempt, signal) => dependencies.relay.fetch({
      ...request,
      knownObjectIds: knownObjects.map(object => object.objectId),
      signal,
    }))
    budget.consumeBytes(response.transferBytes)
    const decodedObjectBytes = response.objects.reduce((sum, object) => sum + Number(object.byteLength || 0), 0)
    if (decodedObjectBytes > response.transferBytes) {
      budget.consumeBytes(decodedObjectBytes - response.transferBytes)
    }
    const materialized = await materializeAgenticGraphGitFetch({
      cache: dependencies.cache,
      request,
      response,
      mode: request.kind,
      nowMs: now(),
    })
    if (!await dependencies.cache.acknowledgeClaimedOutbox(record.id, claimToken)) {
      throw new GitOperationIntegrityError('Git outbox acknowledgement was rejected')
    }
    return {
      status: 'complete',
      operationId: record.id,
      kind: request.kind,
      objectId: materialized.headObjectId,
      objectsReused: materialized.objectsReused,
    }
  }

  const executeCommit = async (
    record: AgenticGraphGitOperationOutboxRecord,
    claimToken: string,
    request: { kind: 'commit' } & AgenticGraphGitCommitRequest,
    budget: GitOperationBudget,
  ): Promise<AgenticGraphGitOperationResult> => {
    const snapshot = await preflightAgenticGraphGitDocuments(request, dependencies)
    const documents = snapshot.documents
    const currentRef = await dependencies.cache.getRef(request.workspaceId, request.repositoryId, request.refName)
    if (currentRef?.targetKind === 'symbolic') throw new GitOperationIntegrityError('Symbolic commit refs are unsupported')
    const previouslyDispatched = record.commitPhase === 'authority-dispatched'
      && typeof record.commitTreeObjectId === 'string'
      && Object.hasOwn(record, 'commitParentObjectId')
    const parentObjectId = previouslyDispatched
      ? record.commitParentObjectId
        ? normalizeGitObjectId(record.commitParentObjectId)
        : null
      : currentRef
        ? normalizeGitObjectId(currentRef.target)
        : null
    const parentObjects = parentObjectId
      ? await listReachableAgenticGraphGitObjects({
          cache: dependencies.cache,
          workspaceId: request.workspaceId,
          repositoryId: request.repositoryId,
          commitObjectId: parentObjectId,
        })
      : undefined
    const built = await buildAgenticGraphGitCommitObjects({
      request,
      documents,
      parentObjectId,
      parentObjects,
      repositoryPathScope: snapshot.repositoryPathScope,
      nowMs: now(),
    })
    const deletions = await resolveAgenticGraphGitDocumentDeletions({
      authority: dependencies.authority,
      request,
      documents,
      parentObjectId,
      parentObjects,
      repositoryPathScope: snapshot.repositoryPathScope,
    })
    if (previouslyDispatched && built.treeObjectId !== record.commitTreeObjectId) {
      throw new GitOperationIntegrityError('Dispatched Git commit no longer rebuilds deterministically')
    }
    const committer = request.committer || request.author
    const documentBytes = documents.reduce(
      (sum, document) => sum + new TextEncoder().encode(document.text).byteLength,
      0,
    )
    if (previouslyDispatched) {
      const knownObjects = await dependencies.cache.listObjects(request.workspaceId, request.repositoryId)
      const response = await runWithRetry(
        record,
        claimToken,
        budget,
        (_attempt, signal) => dependencies.relay.fetch({
          workspaceId: request.workspaceId,
          repositoryId: request.repositoryId,
          remoteId: request.remoteId,
          canonicalPathScope: request.canonicalPathScope,
          refName: request.refName,
          kind: 'fetch',
          knownObjectIds: knownObjects.map(object => object.objectId),
          signal,
        }),
      )
      budget.consumeBytes(response.transferBytes)
      const decodedBytes = response.objects.reduce(
        (sum, object) => sum + Number(object.byteLength || 0),
        0,
      )
      if (decodedBytes > response.transferBytes) budget.consumeBytes(decodedBytes - response.transferBytes)
      const remoteRef = response.refs.find(candidate =>
        candidate.refName === request.refName && candidate.targetKind === 'direct')
      if (remoteRef) {
        const remoteHead = normalizeGitObjectId(remoteRef.target)
        const materialized = await materializeAgenticGraphGitFetch({
          cache: dependencies.cache,
          request,
          response,
          mode: remoteHead === parentObjectId ? 'fetch' : 'remote-save',
          expectedCommit: remoteHead === parentObjectId
            ? undefined
            : { parentObjectId, treeObjectId: built.treeObjectId },
          nowMs: now(),
        })
        if (remoteHead !== parentObjectId) {
          if (!await dependencies.cache.acknowledgeClaimedOutbox(record.id, claimToken)) {
            throw new GitOperationIntegrityError('Git outbox acknowledgement was rejected')
          }
          return {
            status: 'complete',
            operationId: record.id,
            kind: 'commit',
            objectId: materialized.headObjectId,
            objectsReused: materialized.objectsReused,
          }
        }
      } else if (response.refs.length > 0 || parentObjectId !== null) {
        throw new GitOperationIntegrityError('Dispatched Git commit remote state is ambiguous')
      }
    } else {
      if (!await dependencies.cache.patchClaimedOutbox(record.id, claimToken, {
        commitPhase: 'authority-dispatched',
        commitParentObjectId: parentObjectId,
        commitTreeObjectId: built.treeObjectId,
        updatedAtMs: now(),
      })) throw new GitOperationIntegrityError('Git outbox claim was lost')
      record.commitPhase = 'authority-dispatched'
      record.commitParentObjectId = parentObjectId
      record.commitTreeObjectId = built.treeObjectId
    }
    const saved = await runWithRetry(record, claimToken, budget, (_attempt, signal) => {
      budget.consumeBytes(documentBytes)
      return dependencies.authority.writeCommit({
        operationId: record.id,
        workspaceId: request.workspaceId,
        repositoryId: request.repositoryId,
        refName: request.refName,
        parentObjectId,
        treeObjectId: built.treeObjectId,
        expectedCommitObjectId: built.commitObjectId,
        message: request.message,
        author: request.author,
        committer,
        documents,
        deletions,
        signal,
      })
    })
    if (saved.kind === 'remote-save-bridge') {
      const expectedRemoteObjectId = saved.commitObjectId
        ? normalizeGitObjectId(saved.commitObjectId)
        : null
      const knownObjects = await dependencies.cache.listObjects(request.workspaceId, request.repositoryId)
      const response = await runWithRetry(
        record,
        claimToken,
        budget,
        (_attempt, signal) => dependencies.relay.fetch({
          workspaceId: request.workspaceId,
          repositoryId: request.repositoryId,
          remoteId: request.remoteId,
          canonicalPathScope: request.canonicalPathScope,
          refName: request.refName,
          kind: 'fetch',
          knownObjectIds: knownObjects.map(object => object.objectId),
          signal,
        }),
      )
      budget.consumeBytes(response.transferBytes)
      const decodedBytes = response.objects.reduce(
        (sum, object) => sum + Number(object.byteLength || 0),
        0,
      )
      if (decodedBytes > response.transferBytes) budget.consumeBytes(decodedBytes - response.transferBytes)
      const materialized = await materializeAgenticGraphGitFetch({
        cache: dependencies.cache,
        request,
        response,
        mode: 'remote-save',
        expectedCommit: { parentObjectId, treeObjectId: built.treeObjectId },
        nowMs: now(),
      })
      if (expectedRemoteObjectId && materialized.headObjectId !== expectedRemoteObjectId) {
        throw new GitOperationIntegrityError('Remote save bridge head attestation does not match')
      }
      if (!await dependencies.cache.acknowledgeClaimedOutbox(record.id, claimToken)) {
        throw new GitOperationIntegrityError('Git outbox acknowledgement was rejected')
      }
      return {
        status: 'complete',
        operationId: record.id,
        kind: 'commit',
        objectId: materialized.headObjectId,
        objectsReused: materialized.objectsReused,
      }
    }
    if (normalizeGitObjectId(saved.commitObjectId) !== built.commitObjectId) {
      throw new GitOperationIntegrityError('Local commit attestation does not match')
    }
    await persistAgenticGraphGitCommit({
      cache: dependencies.cache,
      request,
      objects: built.objects,
      commitObjectId: built.commitObjectId,
      nowMs: now(),
    })
    await dependencies.cache.putRepository({
      id: buildAgenticGraphGitRepositoryRecordId(request.workspaceId, request.repositoryId),
      workspaceId: request.workspaceId,
      repositoryId: request.repositoryId,
      remoteId: request.remoteId,
      canonicalPathScope: request.canonicalPathScope,
      headRefName: request.refName,
      objectFormat: AGENTIC_OS_GIT_OBJECT_FORMAT,
      updatedAtMs: now(),
    })
    const storedRepository = await dependencies.cache.getRepository(request.workspaceId, request.repositoryId)
    if (!storedRepository || storedRepository.headRefName !== request.refName) {
      throw new GitOperationIntegrityError('Git repository metadata was not durably persisted')
    }
    if (!await dependencies.cache.acknowledgeClaimedOutbox(record.id, claimToken)) {
      throw new GitOperationIntegrityError('Git outbox acknowledgement was rejected')
    }
    return {
      status: 'complete',
      operationId: record.id,
      kind: 'commit',
      objectId: built.commitObjectId,
      objectsReused: 0,
    }
  }

  const executePush = async (
    record: AgenticGraphGitOperationOutboxRecord,
    claimToken: string,
    request: { kind: 'push' } & AgenticGraphGitPushRequest,
    budget: GitOperationBudget,
  ): Promise<AgenticGraphGitOperationResult> => {
    const ref = await dependencies.cache.getRef(request.workspaceId, request.repositoryId, request.refName)
    if (!ref || ref.targetKind !== 'direct') throw new GitOperationIntegrityError('Push ref is unavailable')
    const targetObjectId = normalizeGitObjectId(ref.target)
    const trackingRef: AgenticGraphGitRefRecord = {
      id: buildAgenticGraphGitRefRecordId(
        request.workspaceId,
        request.repositoryId,
        buildAgenticGraphGitRemoteTrackingRefName(request.remoteId, request.refName),
      ),
      workspaceId: request.workspaceId,
      repositoryId: request.repositoryId,
      refName: buildAgenticGraphGitRemoteTrackingRefName(request.remoteId, request.refName),
      targetKind: 'direct',
      target: targetObjectId,
      remoteId: request.remoteId,
      updatedAtMs: now(),
    }
    const records = await listReachableAgenticGraphGitObjects({
      cache: dependencies.cache,
      workspaceId: request.workspaceId,
      repositoryId: request.repositoryId,
      commitObjectId: targetObjectId,
    })
    if (request.expectedRemoteObjectId === targetObjectId) {
      if (!await dependencies.cache.acknowledgeClaimedOutbox(
        record.id,
        claimToken,
        [trackingRef],
      )) throw new GitOperationIntegrityError('Git push acknowledgement was rejected')
      return {
        status: 'complete',
        operationId: record.id,
        kind: 'push',
        objectId: targetObjectId,
        objectsReused: records.length,
      }
    }
    const transferBytes = records.reduce((total, object) => total + object.byteLength, 0)
    if (transferBytes > AGENTIC_OS_GIT_OPERATION_BOUNDS.maxTransferBytes) {
      throw new GitOperationLimitError('Push object graph exceeds byte limit')
    }
    const response = await runWithRetry(record, claimToken, budget, (_attempt, signal) => {
      budget.consumeBytes(transferBytes)
      return dependencies.relay.push({
        ...request,
        targetObjectId,
        objects: records.map(object => ({
          objectId: object.objectId,
          objectType: object.objectType,
          bodyBase64: object.bodyBase64,
          byteLength: decodeGitBytesBase64(object.bodyBase64).byteLength,
        })),
        signal,
      })
    })
    budget.consumeBytes(response.transferBytes)
    if (response.status === 'remote-advanced') return reportFailure(record, claimToken, 'conflict')
    if (normalizeGitObjectId(response.remoteObjectId) !== targetObjectId) {
      throw new GitOperationIntegrityError('Remote ref attestation does not match push target')
    }
    if (!await dependencies.cache.acknowledgeClaimedOutbox(
      record.id,
      claimToken,
      [trackingRef],
    )) throw new GitOperationIntegrityError('Git push acknowledgement was rejected')
    return {
      status: 'complete',
      operationId: record.id,
      kind: 'push',
      objectId: targetObjectId,
      objectsReused: 0,
    }
  }

  const execute = async (
    record: AgenticGraphGitOperationOutboxRecord,
    claimToken: string,
  ): Promise<AgenticGraphGitOperationResult> => {
    const budget = new GitOperationBudget(now(), now)
    try {
      if (record.request.kind === 'clone' || record.request.kind === 'fetch') {
        return await executeFetch(record, claimToken, record.request, budget)
      }
      if (record.request.kind === 'commit') {
        return await executeCommit(record, claimToken, record.request, budget)
      }
      if (record.request.kind === 'push') return await executePush(record, claimToken, record.request, budget)
      throw new GitOperationIntegrityError('Git outbox operation kind is unsupported')
    } catch (error) {
      if (error instanceof Error && error.message === 'persistence-unavailable') throw error
      if (error instanceof GitOperationLimitError) return reportFailure(record, claimToken, 'limit-exceeded')
      if (error instanceof GitOperationAuthError) return reportFailure(record, claimToken, 'auth-failure')
      if (error instanceof GitOperationRetryExhaustedError) {
        return reportFailure(record, claimToken, 'retry-exhausted')
      }
      return reportFailure(record, claimToken, 'invalid-remote')
    } finally {
      budget.close()
    }
  }

  const start = async (
    request: AgenticGraphGitQueuedRequest,
    mode: AgenticGraphGitStorageMode,
  ): Promise<AgenticGraphGitOperationResult> => {
    let normalized: AgenticGraphGitQueuedRequest
    try {
      normalized = normalizeGitRemoteRequest(request)
      if (normalized.kind === 'commit') await preflightAgenticGraphGitDocuments(normalized, dependencies)
      if (normalized.kind === 'push' && normalized.expectedRemoteObjectId) {
        normalized = {
          ...normalized,
          expectedRemoteObjectId: normalizeGitObjectId(normalized.expectedRemoteObjectId),
        }
      }
    } catch (error) {
      if (error instanceof UnsupportedGitPathError) {
        return {
          status: 'unsupported-path',
          operationId: null,
          kind: request.kind,
          message: 'Git operation targets an unsupported document path.',
        }
      }
      return {
        status: 'invalid-remote',
        operationId: null,
        kind: request.kind,
        message: fixedGitOperationMessage(request.kind, 'invalid-remote'),
      }
    }
    const record = await enqueue(normalized)
    if (mode === 'offline-only') {
      return { status: 'queued', operationId: record.id, kind: record.kind }
    }
    const results = await drain(record.workspaceId)
    return results.find(result => result.operationId === record.id)
      ?? { status: 'queued', operationId: record.id, kind: record.kind }
  }

  const drain = async (workspaceId: string): Promise<AgenticGraphGitOperationResult[]> => {
    const normalizedWorkspaceId = normalizeOpaqueGitId(workspaceId, 'workspaceId')
    const existing = drainByWorkspace.get(normalizedWorkspaceId)
    if (existing) return existing
    const run = (async () => {
      await dependencies.cache.requeueFailedOutbox(normalizedWorkspaceId, deviceId, now())
      const results: AgenticGraphGitOperationResult[] = []
      for (;;) {
        const claim = await dependencies.cache.claimNextOutbox({
          workspaceId: normalizedWorkspaceId,
          deviceId,
          claimOwner,
          claimToken: `claim:${defaultGitOperationId()}`,
          nowMs: now(),
          leaseMs: claimLeaseMs,
        })
        if (!claim) break
        const result = await execute(claim.record, claim.claimToken)
        results.push(result)
        if (result.status !== 'complete') break
      }
      return results
    })()
    drainByWorkspace.set(normalizedWorkspaceId, run)
    try {
      return await run
    } finally {
      if (drainByWorkspace.get(normalizedWorkspaceId) === run) {
        drainByWorkspace.delete(normalizedWorkspaceId)
      }
    }
  }

  return {
    readObject: dependencies.cache.getObject.bind(dependencies.cache),
    readRef: dependencies.cache.getRef.bind(dependencies.cache),
    clone: (request: AgenticGraphGitRemoteRequest, mode: AgenticGraphGitStorageMode) =>
      start({ ...request, kind: 'clone' }, mode),
    fetch: (request: AgenticGraphGitRemoteRequest, mode: AgenticGraphGitStorageMode) =>
      start({ ...request, kind: 'fetch' }, mode),
    commit: (request: AgenticGraphGitCommitRequest, mode: AgenticGraphGitStorageMode) =>
      start({ ...request, kind: 'commit' }, mode),
    push: (request: AgenticGraphGitPushRequest, mode: AgenticGraphGitStorageMode) =>
      start({ ...request, kind: 'push' }, mode),
    drain,
  }
}
