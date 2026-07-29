import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const repoRoot = path.resolve(__dirname, '..')
export const contractPath = path.resolve(repoRoot, 'docs', 'collaboration-runtime-contract.md')

export const parseFrontmatter = (source, label = 'document') => {
  const normalized = String(source || '').replace(/^\uFEFF/, '')
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) throw new Error(`${label} must start with YAML frontmatter`)
  const parsed = load(match[1])
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} frontmatter must be a mapping`)
  }
  return parsed
}

const requireStringArray = (value, label) => {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || !item)) {
    throw new Error(`${label} must be a non-empty string array`)
  }
}

const requireCommands = (commands, label, { allowEmpty = false } = {}) => {
  if (!Array.isArray(commands) || (!allowEmpty && commands.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} command array`)
  }
  for (const command of commands) {
    if (!Array.isArray(command) || command.length === 0 || command.some(part => typeof part !== 'string' || !part)) {
      throw new Error(`${label} entries must be non-empty argv arrays`)
    }
  }
}

export const validateContract = contract => {
  if (contract.status !== 'active') throw new Error('contract status must be active')
  if (!Number.isInteger(contract.contract_version) || contract.contract_version < 1) {
    throw new Error('contract_version must be a positive integer')
  }
  if (!Number.isInteger(contract.ci_command_timeout_ms) || contract.ci_command_timeout_ms < 1000) {
    throw new Error('ci_command_timeout_ms must be an integer of at least 1000')
  }

  const invocation = contract.invocation
  if (!invocation || typeof invocation !== 'object') throw new Error('invocation mapping is required')
  requireStringArray(invocation.actions, 'invocation.actions')
  requireStringArray(invocation.required_pr_keys, 'invocation.required_pr_keys')
  for (const patternKey of ['scope_pattern', 'actor_pattern', 'base_sha_pattern']) {
    if (typeof invocation[patternKey] !== 'string') throw new Error(`invocation.${patternKey} is required`)
    new RegExp(invocation[patternKey])
  }

  const coordination = contract.coordination
  if (!coordination || typeof coordination !== 'object') throw new Error('coordination mapping is required')
  if (typeof coordination.base_branch !== 'string' || !coordination.base_branch) {
    throw new Error('coordination.base_branch is required')
  }
  if (typeof coordination.branch_pattern !== 'string') throw new Error('coordination.branch_pattern is required')
  new RegExp(coordination.branch_pattern)
  if (coordination.unique_active_scope !== true) throw new Error('coordination.unique_active_scope must be true')
  requireStringArray(coordination.protected_push_refs, 'coordination.protected_push_refs')

  const localDevelopment = contract.local_development
  if (!localDevelopment || typeof localDevelopment !== 'object') {
    throw new Error('local_development mapping is required')
  }
  for (const key of ['canonical_mode', 'task_mode', 'mode_environment_variable']) {
    if (typeof localDevelopment[key] !== 'string' || !localDevelopment[key]) {
      throw new Error(`local_development.${key} is required`)
    }
  }
  const worktreePolicy = localDevelopment.worktree_policy
  if (!worktreePolicy || typeof worktreePolicy !== 'object' || Array.isArray(worktreePolicy)) {
    throw new Error('local_development.worktree_policy mapping is required')
  }
  if (worktreePolicy.mode !== 'same-device-multi-worktree') {
    throw new Error('local_development.worktree_policy.mode must be same-device-multi-worktree')
  }
  if (worktreePolicy.minimum_registered_per_repository !== 1) {
    throw new Error('local_development.worktree_policy.minimum_registered_per_repository must be 1')
  }
  const canonicalSources = localDevelopment.canonical_sources
  if (!Array.isArray(canonicalSources) || canonicalSources.length === 0) {
    throw new Error('local_development.canonical_sources must be a non-empty array')
  }
  const sourceIds = new Set()
  for (const [index, source] of canonicalSources.entries()) {
    const label = `local_development.canonical_sources[${index}]`
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error(`${label} must be a mapping`)
    for (const key of ['id', 'repository_path', 'required_path', 'canonical_remote', 'canonical_branch']) {
      if (typeof source[key] !== 'string' || !source[key]) throw new Error(`${label}.${key} is required`)
    }
    if (sourceIds.has(source.id)) throw new Error(`local_development.canonical_sources id ${source.id} is duplicated`)
    sourceIds.add(source.id)
    if (source.fetch_required !== true) throw new Error(`${label}.fetch_required must be true`)
    if (source.clean_required !== true) throw new Error(`${label}.clean_required must be true`)
    if (typeof source.task_divergence_allowed !== 'boolean') {
      throw new Error(`${label}.task_divergence_allowed must be a boolean`)
    }
  }
  if (canonicalSources.filter(source => source.task_divergence_allowed).length !== 1) {
    throw new Error('local_development.canonical_sources must allow task divergence for exactly one source')
  }

  const deployment = contract.deployment
  if (!deployment || typeof deployment !== 'object') throw new Error('deployment mapping is required')
  requireStringArray(deployment.allowed_workflows, 'deployment.allowed_workflows')
  requireStringArray(deployment.forbidden_triggers, 'deployment.forbidden_triggers')
  requireStringArray(deployment.command_patterns, 'deployment.command_patterns')
  if (typeof deployment.required_trigger !== 'string' || !deployment.required_trigger) {
    throw new Error('deployment.required_trigger is required')
  }
  if (typeof deployment.required_branch !== 'string' || !deployment.required_branch) {
    throw new Error('deployment.required_branch is required')
  }
  if (deployment.promotion_policy !== 'human-authorized-candidate') {
    throw new Error('deployment.promotion_policy must be human-authorized-candidate')
  }
  for (const pattern of deployment.command_patterns) new RegExp(pattern, 'i')

  if (!contract.ci_scopes || typeof contract.ci_scopes !== 'object') throw new Error('ci_scopes mapping is required')
  for (const [name, scope] of Object.entries(contract.ci_scopes)) {
    requireStringArray(scope.roots, `ci_scopes.${name}.roots`)
    requireCommands(scope.commands, `ci_scopes.${name}.commands`, { allowEmpty: true })
  }
  requireCommands(contract.fallback_commands, 'fallback_commands')
  return contract
}

export const readContract = async () => {
  const source = await fs.readFile(contractPath, 'utf8')
  return validateContract(parseFrontmatter(source, path.relative(repoRoot, contractPath)))
}

export const validatePullRequestMetadata = (body, contract, { allowIncomplete = false } = {}) => {
  if (!String(body || '').trim()) {
    if (allowIncomplete) return null
    throw new Error('ready pull request must declare collaboration frontmatter')
  }

  let metadata
  try {
    metadata = parseFrontmatter(body, 'pull request body')
  } catch (error) {
    if (allowIncomplete) return null
    throw error
  }

  try {
    const { invocation } = contract
    for (const key of invocation.required_pr_keys) {
      if (typeof metadata[key] !== 'string' || !metadata[key]) throw new Error(`pull request frontmatter requires ${key}`)
    }
    if (!invocation.actions.includes(metadata.action)) {
      throw new Error(`pull request action must be one of: ${invocation.actions.join(', ')}`)
    }
    for (const [key, patternKey] of [['scope', 'scope_pattern'], ['actor', 'actor_pattern'], ['base_sha', 'base_sha_pattern']]) {
      if (!new RegExp(invocation[patternKey]).test(metadata[key])) {
        throw new Error(`pull request ${key} does not satisfy ${invocation[patternKey]}`)
      }
    }
  } catch (error) {
    if (allowIncomplete) return null
    throw error
  }
  return metadata
}

export const validateTaskBranch = (branchName, contract, semanticScope) => {
  if (typeof branchName !== 'string' || !new RegExp(contract.coordination.branch_pattern).test(branchName)) {
    throw new Error(`pull request branch must satisfy ${contract.coordination.branch_pattern}`)
  }
  if (semanticScope) {
    const expectedScopeSegment = semanticScope.slice(1).replaceAll('.', '-').replaceAll('_', '-')
    const actualScopeSegment = branchName.split('/')[2]
    if (actualScopeSegment !== expectedScopeSegment) {
      throw new Error(`pull request branch scope must be ${expectedScopeSegment} for ${semanticScope}`)
    }
  }
  return branchName
}

export const collectActiveScopeClaims = (pullRequests, contract) => {
  const claims = []
  for (const pullRequest of Array.isArray(pullRequests) ? pullRequests : []) {
    const metadata = validatePullRequestMetadata(pullRequest?.body, contract, { allowIncomplete: true })
    if (!metadata) continue
    claims.push({
      actor: metadata.actor,
      branch: pullRequest?.head?.ref || '',
      number: Number(pullRequest?.number),
      scope: metadata.scope,
      url: pullRequest?.html_url || '',
    })
  }
  return claims
}

export const findActiveScopeConflicts = (pullRequests, currentPullNumber, contract) => {
  const claims = collectActiveScopeClaims(pullRequests, contract)
  const current = claims.find(claim => claim.number === Number(currentPullNumber))
  if (!current) return []
  return claims.filter(claim => claim.number !== current.number && claim.scope === current.scope)
}

export const selectAffectedCommands = (changedPaths, contract) => {
  const normalizedPaths = [...new Set(changedPaths.map(value => String(value).replaceAll('\\', '/')).filter(Boolean))].sort()
  const commands = new Map()
  const matchedPaths = new Set()
  const scopes = []

  for (const [name, scope] of Object.entries(contract.ci_scopes)) {
    const matches = normalizedPaths.filter(rel => scope.roots.some(root => rel === root || rel.startsWith(root)))
    if (matches.length === 0) continue
    scopes.push(name)
    matches.forEach(rel => matchedPaths.add(rel))
    for (const command of scope.commands) commands.set(JSON.stringify(command), command)
  }

  const unmatchedPaths = normalizedPaths.filter(rel => !matchedPaths.has(rel))
  if (unmatchedPaths.length > 0) {
    for (const command of contract.fallback_commands) commands.set(JSON.stringify(command), command)
  }

  return { commands: [...commands.values()], scopes, unmatchedPaths }
}
