import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import {
  readContract,
  repoRoot,
  validatePullRequestMetadata,
  validateTaskBranch,
} from './collaboration-contract.mjs'
import {
  listWorkflowSources,
  validateRuntimeDocsWorkflowPolicy,
} from './runtime-docs-workflow-policy.mjs'
import {
  COLLABORATION_RUNTIME_REPORT_SCHEMA,
  resolveCollaborationRuntimeSourceRevision,
  validateCollaborationRuntimeReport,
} from './collaboration-runtime-report.mjs'

const workflowTriggers = workflow => {
  const trigger = workflow.on
  if (typeof trigger === 'string') return [trigger]
  if (Array.isArray(trigger)) return trigger
  if (trigger && typeof trigger === 'object') return Object.keys(trigger)
  return []
}

const validateDeploymentIsolation = (contract, workflowSources) => {
  const allowed = new Set(contract.deployment.allowed_workflows)
  const requiredTrigger = contract.deployment.required_trigger
  const requiredBranch = contract.deployment.required_branch
  const forbiddenTriggers = new Set(contract.deployment.forbidden_triggers)
  const deploymentPatterns = contract.deployment.command_patterns.map(pattern => new RegExp(pattern, 'i'))
  const seenAllowed = new Set()

  for (const { workflowPath: rel, source } of workflowSources) {
    const containsDeployment = deploymentPatterns.some(pattern => pattern.test(source))
    if (!containsDeployment) continue
    if (!allowed.has(rel)) throw new Error(`deployment command is forbidden outside an allowed workflow: ${rel}`)

    seenAllowed.add(rel)
    const workflow = load(source)
    const triggers = workflowTriggers(workflow)
    const configuredBranches = workflow?.on?.[requiredTrigger]?.branches
    if (!triggers.includes(requiredTrigger) || triggers.some(trigger => forbiddenTriggers.has(trigger))) {
      throw new Error(`${rel} must use only the protected ${requiredTrigger} deployment trigger`)
    }
    if (requiredTrigger === 'workflow_dispatch') {
      const protectedRefCheck = `test "$GITHUB_REF" = "refs/heads/${requiredBranch}"`
      if (!source.includes(protectedRefCheck)) {
        throw new Error(`${rel} must restrict ${requiredTrigger} deployment to ${requiredBranch}`)
      }
    } else if (!Array.isArray(configuredBranches) || configuredBranches.length !== 1 || configuredBranches[0] !== requiredBranch) {
      throw new Error(`${rel} must restrict ${requiredTrigger} deployment to ${requiredBranch}`)
    }
  }

  for (const rel of allowed) {
    if (!seenAllowed.has(rel)) throw new Error(`allowed deployment workflow is missing a recognized deployment command: ${rel}`)
  }

  return {
    id: 'deployment-isolation/v1',
    status: 'passed',
    workflowCount: workflowSources.length,
    deploymentWorkflowCount: seenAllowed.size,
    allowedWorkflows: [...allowed].sort(),
  }
}

const assertBaseShaIsAncestor = baseSha => {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', baseSha, 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(`declared base_sha is not an ancestor of HEAD: ${baseSha}`)
}

const emptyCloudAuthority = (contract, status) => ({
  authority: contract.coordination.authority,
  remoteAuthorityCheck: status,
  claimId: null,
  claimDigest: null,
  ledgerRevision: null,
  writeSetDigest: null,
  verificationReceiptDigest: null,
})

const verifyProtectedCloudAuthority = ({ contract, pullNumber }) => {
  const repository = String(process.env.KNOWGRPH_REPOSITORY || '').trim()
  const token = String(process.env.KNOWGRPH_GITHUB_TOKEN || '').trim()
  const upstreamRoot = String(process.env.KNOWGRPH_AGENTIC_CANVAS_OS_ROOT || '').trim()
  const required = String(process.env.KNOWGRPH_REQUIRE_REMOTE_AUTHORITY_CHECK).toLowerCase() === 'true'
  const branch = String(process.env.KNOWGRPH_PR_HEAD_REF || '').trim()
  const baseSha = String(process.env.KNOWGRPH_PR_BASE_SHA || '').trim()
  const headSha = String(process.env.KNOWGRPH_PR_HEAD_SHA || '').trim()
  if (!repository || !token || !upstreamRoot || !branch || !baseSha || !headSha) {
    if (required) {
      throw new Error('protected cloud authority verification requires repository, token, upstream root, branch, base SHA, and head SHA')
    }
    return emptyCloudAuthority(contract, 'skipped')
  }

  const cliPath = path.resolve(upstreamRoot, 'scripts', 'cloud-collaboration.mjs')
  if (!existsSync(cliPath)) {
    throw new Error('protected cloud authority CLI is unavailable from the pinned Agentic Canvas OS source')
  }
  const request = {
    targetRepository: repository,
    pullRequestNumber: pullNumber,
    branch,
    canonicalBaseRevision: baseSha,
    laneRevision: headSha,
    requiredState: 'review-ready',
  }
  const result = spawnSync(
    process.execPath,
    [cliPath, 'verify', `--request-json=${JSON.stringify(request)}`, '--json'],
    {
      cwd: upstreamRoot,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        GH_TOKEN: token,
        AGENTIC_LEDGER_REPOSITORY: contract.coordination.ledger_repository,
      },
    },
  )
  let output
  try {
    output = JSON.parse(result.stdout)
  } catch {
    throw new Error('protected cloud authority verifier returned invalid JSON')
  }
  if (result.status !== 0 || output.ok !== true || output.status !== 'ready') {
    const message = output?.error?.message
      || output?.findings?.map(finding => finding.code).join(', ')
      || result.stderr.trim()
      || 'verification failed'
    throw new Error(`protected cloud authority verification failed: ${message}`)
  }
  for (const [label, value, pattern] of [
    ['claim ID', output.claim?.claimId, /^[0-9a-f]{64}$/],
    ['claim digest', output.claimDigest, /^[0-9a-f]{64}$/],
    ['ledger revision', output.ledgerRevision, /^[0-9a-f]{40}$/],
    ['write-set digest', output.claim?.writeSetDigest, /^[0-9a-f]{64}$/],
    ['verification receipt digest', output.receipt?.receiptDigest, /^[0-9a-f]{64}$/],
  ]) {
    if (!pattern.test(String(value || ''))) throw new Error(`protected cloud authority omitted a valid ${label}`)
  }
  return {
    authority: contract.coordination.authority,
    remoteAuthorityCheck: 'passed',
    claimId: output.claim.claimId,
    claimDigest: output.claimDigest,
    ledgerRevision: output.ledgerRevision,
    writeSetDigest: output.claim.writeSetDigest,
    verificationReceiptDigest: output.receipt.receiptDigest,
  }
}

const validatePullRequestCoordination = async contract => {
  const pullNumber = Number(process.env.KNOWGRPH_PR_NUMBER)
  if (!Number.isInteger(pullNumber) || pullNumber < 1) {
    return {
      id: 'pull-request-coordination/v1',
      status: 'not-applicable',
    }
  }

  if (process.env.KNOWGRPH_PR_BASE_REF !== contract.coordination.base_branch) {
    throw new Error(`pull request must target ${contract.coordination.base_branch}`)
  }
  validateTaskBranch(process.env.KNOWGRPH_PR_HEAD_REF, contract)
  const draft = String(process.env.KNOWGRPH_PR_DRAFT).toLowerCase() === 'true'
  const metadata = validatePullRequestMetadata(process.env.KNOWGRPH_PR_BODY, contract, { allowIncomplete: draft })
  if (!metadata) {
    return {
      id: 'pull-request-coordination/v1',
      status: 'passed',
      pullNumber,
      draft: true,
      scope: null,
      ...emptyCloudAuthority(contract, 'not-applicable'),
    }
  }
  validateTaskBranch(process.env.KNOWGRPH_PR_HEAD_REF, contract, metadata.scope)
  assertBaseShaIsAncestor(metadata.base_sha)
  const projectedBaseSha = String(process.env.KNOWGRPH_PR_BASE_SHA || '').trim()
  if (projectedBaseSha && metadata.base_sha !== projectedBaseSha) {
    throw new Error('pull request base_sha must equal the exact current protected base SHA')
  }
  const cloudAuthority = draft
    ? emptyCloudAuthority(contract, 'not-applicable')
    : verifyProtectedCloudAuthority({ contract, pullNumber })
  return {
    id: 'pull-request-coordination/v1',
    status: 'passed',
    pullNumber,
    draft,
    scope: metadata.scope,
    ...cloudAuthority,
  }
}

const outputFormat = (() => {
  const args = process.argv.slice(2)
  if (args.length === 0) return 'human'
  if (args.length === 1 && args[0] === '--json') return 'json'
  throw new Error(`unsupported collaboration contract arguments: ${args.join(' ')}`)
})()

const main = async () => {
  const contract = await readContract()
  const workflowSources = await listWorkflowSources()
  const deploymentIsolation = validateDeploymentIsolation(contract, workflowSources)
  const runtimeDocsWorkflow = validateRuntimeDocsWorkflowPolicy(workflowSources)
  const pullRequestCoordination = await validatePullRequestCoordination(contract)

  const report = {
    schema: COLLABORATION_RUNTIME_REPORT_SCHEMA,
    status: 'passed',
    contractVersion: contract.contract_version,
    sourceRevision: resolveCollaborationRuntimeSourceRevision(),
    policies: {
      deploymentIsolation,
      runtimeDocsWorkflow,
      pullRequestCoordination,
    },
  }

  await validateCollaborationRuntimeReport(report)

  if (outputFormat === 'json') console.log(JSON.stringify(report, null, 2))
  else console.log('[knowgrph] collaboration runtime contract passed')
}

await main()
