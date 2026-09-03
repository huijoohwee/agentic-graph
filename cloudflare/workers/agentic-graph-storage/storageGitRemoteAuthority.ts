import {
  DOCUMENT_REPOSITORY_TARGETS,
  type DocumentRepositoryTarget,
} from '../../../grph-shared/src/collaboration/documentRepositoryAuthority'
import type { AgenticGraphStorageWorkerEnv } from './contract'
import { normalizeString } from './db'

export type StorageGitRemoteAuthority = {
  repositoryTarget: DocumentRepositoryTarget
  remoteId: string
  repository: string
}

const DEFAULT_REMOTE_IDS = {
  [DOCUMENT_REPOSITORY_TARGETS.agenticGraphDocs]: 'origin',
  [DOCUMENT_REPOSITORY_TARGETS.workspaceDocs]: 'workspace-origin',
} as const

const readAuthorities = (env: AgenticGraphStorageWorkerEnv): [
  StorageGitRemoteAuthority,
  StorageGitRemoteAuthority,
] => [
  {
    repositoryTarget: DOCUMENT_REPOSITORY_TARGETS.agenticGraphDocs,
    remoteId: normalizeString(env.AGENTIC_OS_STORAGE_GIT_AGENTIC_OS_REMOTE_ID)
      || DEFAULT_REMOTE_IDS[DOCUMENT_REPOSITORY_TARGETS.agenticGraphDocs],
    repository: normalizeString(env.AGENTIC_OS_STORAGE_GITHUB_AGENTIC_OS_REPO),
  },
  {
    repositoryTarget: DOCUMENT_REPOSITORY_TARGETS.workspaceDocs,
    remoteId: normalizeString(env.AGENTIC_OS_STORAGE_GIT_WORKSPACE_REMOTE_ID)
      || DEFAULT_REMOTE_IDS[DOCUMENT_REPOSITORY_TARGETS.workspaceDocs],
    repository: normalizeString(env.AGENTIC_OS_STORAGE_GITHUB_WORKSPACE_REPO),
  },
]

export const readStorageGitRemoteAuthorities = (
  env: AgenticGraphStorageWorkerEnv,
): readonly StorageGitRemoteAuthority[] => {
  const authorities = readAuthorities(env)
  if (authorities[0].remoteId === authorities[1].remoteId) {
    throw new Error('Git remote IDs must be distinct for each repository target')
  }
  return authorities
}

export const readStorageGitRemoteAuthority = (
  env: AgenticGraphStorageWorkerEnv,
  repositoryTarget: DocumentRepositoryTarget,
): StorageGitRemoteAuthority => {
  const authority = readStorageGitRemoteAuthorities(env)
    .find(candidate => candidate.repositoryTarget === repositoryTarget)
  if (!authority) throw new Error(`unsupported Git repository target: ${repositoryTarget}`)
  return authority
}
