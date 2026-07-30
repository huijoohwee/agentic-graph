import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { repoRoot } from './collaboration-contract.mjs'
import {
  assertRemoteRevisionAuthority,
  readRemoteRevision,
} from './immutable-release-manifest.mjs'

const PROTECTED_MAIN_REF = 'refs/heads/main'

export const verifyProtectedMainReleaseAuthority = ({
  sourceRevision,
  remote = 'origin',
  cwd = repoRoot,
}) => {
  const authority = assertRemoteRevisionAuthority({
    sourceRevision,
    remoteRevision: readRemoteRevision({
      remote,
      targetRef: PROTECTED_MAIN_REF,
      cwd,
    }),
    targetRef: PROTECTED_MAIN_REF,
  })
  return {
    sourceRevision: authority.sourceRevision,
    protectedMainRevision: authority.remoteRevision,
    targetRef: authority.targetRef,
  }
}

const main = () => {
  const { values } = parseArgs({
    options: {
      'source-sha': { type: 'string' },
    },
    strict: true,
  })
  if (!values['source-sha']) throw new Error('--source-sha is required')
  const authority = verifyProtectedMainReleaseAuthority({
    sourceRevision: values['source-sha'],
  })
  process.stdout.write(`${JSON.stringify({
    schema: 'knowgrph-protected-main-release-authority/v1',
    status: 'passed',
    ...authority,
  })}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
