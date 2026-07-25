import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createInitialSourceFilesBootstrapState,
  deriveSourceFilesBootstrapSnapshot,
  projectSourceFilesBootstrapSnapshotForIntent,
  reduceSourceFilesBootstrapState,
} from '@/features/source-files/sourceFilesBootstrapReadiness'

export function testSourceFilesBootstrapReadinessRejectsStaleDocumentIntentTransitions(): void {
  const initial = createInitialSourceFilesBootstrapState()
  if (deriveSourceFilesBootstrapSnapshot(initial).phase !== 'resolving') {
    throw new Error('source authority must start unresolved')
  }

  const intentA = reduceSourceFilesBootstrapState(initial, {
    type: 'begin-document-intent',
    key: '?kgShare=a',
  })
  const baseReady = reduceSourceFilesBootstrapState(intentA, { type: 'complete-bootstrap' })
  if (deriveSourceFilesBootstrapSnapshot(baseReady).phase !== 'resolving') {
    throw new Error('base hydration must not publish a scene while document intent is unresolved')
  }

  const intentB = reduceSourceFilesBootstrapState(baseReady, {
    type: 'begin-document-intent',
    key: '?kgShare=b',
  })
  const staleCompletion = reduceSourceFilesBootstrapState(intentB, {
    type: 'complete-document-intent',
    key: '?kgShare=a',
  })
  const staleFailure = reduceSourceFilesBootstrapState(staleCompletion, {
    type: 'fail-document-intent',
    key: '?kgShare=a',
    error: new Error('stale failure'),
  })
  if (staleCompletion !== intentB || staleFailure !== intentB) {
    throw new Error('stale document completion or failure must not replace the current source intent')
  }

  const intentReady = reduceSourceFilesBootstrapState(intentB, {
    type: 'complete-document-intent',
    key: '?kgShare=b',
  })
  const readySnapshot = deriveSourceFilesBootstrapSnapshot(intentReady)
  if (readySnapshot.phase !== 'ready' || readySnapshot.documentIntentKey !== '?kgShare=b') {
    throw new Error(`current document intent must publish ready authority, got ${JSON.stringify(readySnapshot)}`)
  }

  const failedCurrentIntent = reduceSourceFilesBootstrapState(intentReady, {
    type: 'fail-document-intent',
    key: '?kgShare=b',
    error: new Error('materialization failed'),
  })
  const retriedCurrentIntent = reduceSourceFilesBootstrapState(failedCurrentIntent, {
    type: 'begin-document-intent',
    key: '?kgShare=b',
  })
  const retrySnapshot = deriveSourceFilesBootstrapSnapshot(retriedCurrentIntent)
  if (retrySnapshot.phase !== 'resolving' || retrySnapshot.error !== null) {
    throw new Error(`retrying the same failed source intent must close authority and clear its stale error, got ${JSON.stringify(retrySnapshot)}`)
  }
}

export function testSourceFilesBootstrapReadinessKeepsBaseFailureTerminal(): void {
  const initial = createInitialSourceFilesBootstrapState()
  const withIntent = reduceSourceFilesBootstrapState(initial, {
    type: 'begin-document-intent',
    key: '?kgShare=canonical',
  })
  const failed = reduceSourceFilesBootstrapState(withIntent, {
    type: 'fail-bootstrap',
    error: new Error('workspace unavailable'),
  })
  const lateIntentCompletion = reduceSourceFilesBootstrapState(failed, {
    type: 'complete-document-intent',
    key: '?kgShare=canonical',
  })
  const lateBootstrapCompletion = reduceSourceFilesBootstrapState(lateIntentCompletion, {
    type: 'complete-bootstrap',
  })
  const snapshot = deriveSourceFilesBootstrapSnapshot(lateBootstrapCompletion)
  if (snapshot.basePhase !== 'error' || snapshot.phase !== 'error' || snapshot.error !== 'workspace unavailable') {
    throw new Error(`base bootstrap failure must remain terminal, got ${JSON.stringify(snapshot)}`)
  }
}

export function testSourceFilesBootstrapReadinessProjectsNewRenderIntentBeforeEffects(): void {
  const readyState = reduceSourceFilesBootstrapState(
    createInitialSourceFilesBootstrapState(),
    { type: 'complete-bootstrap' },
  )
  const readySnapshot = deriveSourceFilesBootstrapSnapshot(readyState)
  const projected = projectSourceFilesBootstrapSnapshotForIntent(readySnapshot, 'document-b')
  if (projected.phase !== 'resolving'
    || projected.documentIntentKey !== 'document-b'
    || projected.documentIntentPhase !== 'resolving') {
    throw new Error(`a newly rendered route must close source authority before layout effects, got ${JSON.stringify(projected)}`)
  }
  const activePathAuthoritySource = readFileSync(resolve(
    process.cwd(),
    'src/features/source-files/sourceFilesActivePathAuthority.ts',
  ), 'utf8')
  for (const marker of [
    'beginSourceFilesDocumentIntent(request.sourceAuthorityIntentKey)',
    'completeSourceFilesDocumentIntent(request.sourceAuthorityIntentKey)',
    'failSourceFilesDocumentIntent(request.sourceAuthorityIntentKey, error)',
  ]) {
    if (!activePathAuthoritySource.includes(marker)) {
      throw new Error(`post-bootstrap active-path materialization must fail closed through source authority: ${marker}`)
    }
  }
}

export function testSourceFilesBootstrapReadinessRetainsRuntimeMountAcrossLaterIntents(): void {
  const initial = createInitialSourceFilesBootstrapState()
  const initialIntent = reduceSourceFilesBootstrapState(initial, {
    type: 'begin-document-intent',
    key: 'initial-document',
  })
  const hydratedInitialIntent = reduceSourceFilesBootstrapState(initialIntent, {
    type: 'complete-bootstrap',
  })
  const pendingInitialSnapshot = deriveSourceFilesBootstrapSnapshot(hydratedInitialIntent)
  if (pendingInitialSnapshot.phase !== 'resolving' || pendingInitialSnapshot.hasReachedReady) {
    throw new Error(`initial document authority must resolve before run-ready runtimes mount, got ${JSON.stringify(pendingInitialSnapshot)}`)
  }

  const initiallyReady = reduceSourceFilesBootstrapState(hydratedInitialIntent, {
    type: 'complete-document-intent',
    key: 'initial-document',
  })
  const readySnapshot = deriveSourceFilesBootstrapSnapshot(initiallyReady)
  if (readySnapshot.phase !== 'ready' || !readySnapshot.hasReachedReady) {
    throw new Error(`completed initial authority must enable run-ready runtimes, got ${JSON.stringify(readySnapshot)}`)
  }

  const laterIntent = reduceSourceFilesBootstrapState(initiallyReady, {
    type: 'begin-document-intent',
    key: 'later-document',
  })
  const pendingLaterSnapshot = deriveSourceFilesBootstrapSnapshot(laterIntent)
  if (pendingLaterSnapshot.phase !== 'resolving' || !pendingLaterSnapshot.hasReachedReady) {
    throw new Error(`later Source Files switching must retain mounted lifecycle owners, got ${JSON.stringify(pendingLaterSnapshot)}`)
  }
}
