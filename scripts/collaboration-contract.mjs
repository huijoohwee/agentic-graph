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

const commandKey = command => JSON.stringify(command)

const validateCommandTimeoutOverrides = (contract, declaredCommands) => {
  const overrides = contract.ci_command_timeout_overrides
  if (overrides === undefined) return new Map()
  if (!Array.isArray(overrides)) throw new Error('ci_command_timeout_overrides must be an array')

  const overrideKeys = new Set()
  const timeoutByCommand = new Map()
  for (const [index, override] of overrides.entries()) {
    const label = `ci_command_timeout_overrides[${index}]`
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      throw new Error(`${label} must be a mapping`)
    }
    requireCommands([override.command], `${label}.command`)
    if (!Number.isInteger(override.timeout_ms) || override.timeout_ms < 1000) {
      throw new Error(`${label}.timeout_ms must be an integer of at least 1000`)
    }
    const key = commandKey(override.command)
    if (!declaredCommands.has(key)) throw new Error(`${label}.command must be declared by a CI scope or fallback`)
    if (overrideKeys.has(key)) throw new Error(`${label}.command is duplicated`)
    overrideKeys.add(key)
    timeoutByCommand.set(key, override.timeout_ms)
  }

  return timeoutByCommand
}

const validateCommandExpansions = (contract, declaredCommands) => {
  const expansions = contract.ci_command_expansions
  if (expansions === undefined) return
  if (!Array.isArray(expansions)) throw new Error('ci_command_expansions must be an array')
  const expansionKeys = new Set()
  const expansionByKey = new Map()
  for (const [index, expansion] of expansions.entries()) {
    const label = `ci_command_expansions[${index}]`
    if (!expansion || typeof expansion !== 'object' || Array.isArray(expansion)) {
      throw new Error(`${label} must be a mapping`)
    }
    requireCommands([expansion.command], `${label}.command`)
    requireCommands(expansion.steps, `${label}.steps`)
    const key = commandKey(expansion.command)
    if (!declaredCommands.has(key)) throw new Error(`${label}.command must be declared by a CI scope or fallback`)
    if (expansionKeys.has(key)) throw new Error(`${label}.command is duplicated`)
    if (expansion.steps.some(step => commandKey(step) === key)) {
      throw new Error(`${label}.steps cannot include its own command`)
    }
    expansionKeys.add(key)
    expansionByKey.set(key, expansion.steps)
  }

  const visited = new Set()
  const visiting = new Set()
  const visit = key => {
    if (visited.has(key)) return
    if (visiting.has(key)) throw new Error('ci_command_expansions must not contain a cycle')
    visiting.add(key)
    for (const step of expansionByKey.get(key) || []) {
      const stepKey = commandKey(step)
      if (expansionByKey.has(stepKey)) visit(stepKey)
    }
    visiting.delete(key)
    visited.add(key)
  }
  for (const key of expansionByKey.keys()) visit(key)
}

const validateExactPathScopes = (contract, declaredCommands) => {
  const definitions = contract.ci_exact_path_scopes
  if (definitions === undefined) return new Map()
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) {
    throw new Error('ci_exact_path_scopes must be a mapping')
  }

  const exactScopes = new Map()
  for (const [scopeName, definition] of Object.entries(definitions)) {
    const label = `ci_exact_path_scopes.${scopeName}`
    const scope = contract.ci_scopes?.[scopeName]
    if (!scope) throw new Error(`${label} must name a declared CI scope`)
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      throw new Error(`${label} must be a mapping`)
    }
    if (!Array.isArray(definition.entries) || definition.entries.length === 0) {
      throw new Error(`${label}.entries must be a non-empty array`)
    }

    const pathCommands = new Map()
    for (const [index, entry] of definition.entries.entries()) {
      const entryLabel = `${label}.entries[${index}]`
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`${entryLabel} must be a mapping`)
      }
      const exactPath = entry.path
      if (
        typeof exactPath !== 'string'
        || !exactPath
        || exactPath.includes('\\')
        || path.posix.isAbsolute(exactPath)
        || path.posix.normalize(exactPath) !== exactPath
        || exactPath.endsWith('/')
      ) {
        throw new Error(`${entryLabel}.path must be one canonical repository-relative file path`)
      }
      if (!scope.roots.some(root => exactPath === root || exactPath.startsWith(root))) {
        throw new Error(`${entryLabel}.path must belong to CI scope ${scopeName}`)
      }
      if (pathCommands.has(exactPath)) throw new Error(`${entryLabel}.path is duplicated`)
      requireCommands(entry.commands, `${entryLabel}.commands`)
      pathCommands.set(exactPath, entry.commands)
      for (const command of entry.commands) declaredCommands.add(commandKey(command))
    }
    exactScopes.set(scopeName, {
      pathCommands,
    })
  }
  return exactScopes
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
    if (source.pinned_ref_allowed !== undefined) {
      if (typeof source.pinned_ref_allowed !== 'boolean') {
        throw new Error(`${label}.pinned_ref_allowed must be a boolean`)
      }
      if (source.pinned_ref_allowed) {
        if (source.task_divergence_allowed) {
          throw new Error(`${label}.pinned_ref_allowed cannot relax the task-divergence application source`)
        }
        if (typeof source.pinned_ref_frontmatter !== 'string' || !source.pinned_ref_frontmatter) {
          throw new Error(`${label}.pinned_ref_frontmatter is required when pinned_ref_allowed is true`)
        }
      }
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
  const declaredCommands = new Set()
  for (const [name, scope] of Object.entries(contract.ci_scopes)) {
    requireStringArray(scope.roots, `ci_scopes.${name}.roots`)
    requireCommands(scope.commands, `ci_scopes.${name}.commands`, { allowEmpty: true })
    for (const command of scope.commands) declaredCommands.add(commandKey(command))
  }
  requireCommands(contract.fallback_commands, 'fallback_commands')
  for (const command of contract.fallback_commands) declaredCommands.add(commandKey(command))
  for (const expansion of contract.ci_command_expansions || []) {
    requireCommands(expansion.steps, 'ci_command_expansions steps')
    for (const step of expansion.steps) declaredCommands.add(commandKey(step))
  }
  contract.ci_exact_path_scope_by_name = validateExactPathScopes(contract, declaredCommands)
  validateCommandExpansions(contract, declaredCommands)
  contract.ci_command_timeout_by_command = validateCommandTimeoutOverrides(contract, declaredCommands)
  return contract
}

export const readContract = async () => {
  const source = await fs.readFile(contractPath, 'utf8')
  return validateContract(parseFrontmatter(source, path.relative(repoRoot, contractPath)))
}

export const resolveCiCommandTimeoutMs = (command, contract) => {
  const timeout = contract?.ci_command_timeout_by_command?.get(commandKey(command))
  return timeout ?? contract?.ci_command_timeout_ms
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
  const normalizedPathSet = new Set(normalizedPaths)
  const commands = new Map()
  const expansionByKey = new Map((contract.ci_command_expansions || []).map(expansion => [
    commandKey(expansion.command),
    expansion.steps,
  ]))
  const matchedPaths = new Set()
  const scopes = []

  const addCommand = command => {
    const expanded = expansionByKey.get(commandKey(command))
    if (expanded) {
      for (const step of expanded) addCommand(step)
      return
    }
    commands.set(commandKey(command), command)
  }

  for (const [name, scope] of Object.entries(contract.ci_scopes)) {
    const matches = normalizedPaths.filter(rel => scope.roots.some(root => rel === root || rel.startsWith(root)))
    if (matches.length === 0) continue
    scopes.push(name)
    matches.forEach(rel => matchedPaths.add(rel))
    const exactScope = contract.ci_exact_path_scope_by_name?.get(name)
    const exactOnly = exactScope
      && normalizedPaths.length > 0
      && normalizedPaths.every(rel => exactScope.pathCommands.has(rel))
    if (!exactOnly) {
      for (const command of scope.commands) addCommand(command)
      continue
    }
    for (const [exactPath, exactCommands] of exactScope.pathCommands) {
      if (!normalizedPathSet.has(exactPath)) continue
      for (const command of exactCommands) addCommand(command)
    }
  }

  const unmatchedPaths = normalizedPaths.filter(rel => !matchedPaths.has(rel))
  if (unmatchedPaths.length > 0) {
    for (const command of contract.fallback_commands) addCommand(command)
  }

  return { commands: [...commands.values()], scopes, unmatchedPaths }
}
