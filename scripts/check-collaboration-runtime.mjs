import { spawnSync } from 'node:child_process'
import { load } from 'js-yaml'
import {
  findActiveScopeConflicts,
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
import { fetchOpenPullRequests } from './github-active-scope-client.mjs'

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

const validatePullRequestCoordination = async contract => {
  const pullNumber = Number(process.env.AGENTICGRAPH_PR_NUMBER)
  if (!Number.isInteger(pullNumber) || pullNumber < 1) {
    return {
      id: 'pull-request-coordination/v1',
      status: 'not-applicable',
    }
  }

  if (process.env.AGENTICGRAPH_PR_BASE_REF !== contract.coordination.base_branch) {
    throw new Error(`pull request must target ${contract.coordination.base_branch}`)
  }
  validateTaskBranch(process.env.AGENTICGRAPH_PR_HEAD_REF, contract)
  const allowIncomplete = String(process.env.AGENTICGRAPH_PR_DRAFT).toLowerCase() === 'true'
  const metadata = validatePullRequestMetadata(process.env.AGENTICGRAPH_PR_BODY, contract, { allowIncomplete })
  if (!metadata) {
    return {
      id: 'pull-request-coordination/v1',
      status: 'passed',
      pullNumber,
      draft: true,
      scope: null,
      remoteScopeCheck: 'not-applicable',
    }
  }
  validateTaskBranch(process.env.AGENTICGRAPH_PR_HEAD_REF, contract, metadata.scope)
  assertBaseShaIsAncestor(metadata.base_sha)

  const repository = String(process.env.AGENTICGRAPH_REPOSITORY || '').trim()
  const token = String(process.env.AGENTICGRAPH_GITHUB_TOKEN || '').trim()
  const requireRemoteScopeCheck = String(process.env.AGENTICGRAPH_REQUIRE_REMOTE_SCOPE_CHECK).toLowerCase() === 'true'
  if (!repository || !token) {
    if (requireRemoteScopeCheck) throw new Error('pull request scope enforcement requires repository and GitHub token context')
    return {
      id: 'pull-request-coordination/v1',
      status: 'passed',
      pullNumber,
      draft: allowIncomplete,
      scope: metadata.scope,
      remoteScopeCheck: 'skipped',
    }
  }
  const openPullRequests = await fetchOpenPullRequests(repository, token)
  const conflicts = findActiveScopeConflicts(openPullRequests, pullNumber, contract)
  if (conflicts.length > 0) {
    const owners = conflicts.map(conflict => `#${conflict.number} ${conflict.actor} ${conflict.branch}`).join(', ')
    throw new Error(`semantic scope ${metadata.scope} already has an active owner: ${owners}`)
  }
  return {
    id: 'pull-request-coordination/v1',
    status: 'passed',
    pullNumber,
    draft: allowIncomplete,
    scope: metadata.scope,
    remoteScopeCheck: 'passed',
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
  else console.log('[agenticgraph] collaboration runtime contract passed')
}

await main()
