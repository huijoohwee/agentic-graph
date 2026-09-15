import fs from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter, repoRoot } from './collaboration-contract.mjs'

export const runtimeReadinessContractPath = path.resolve(
  repoRoot,
  'docs',
  'runtime-readiness-contract.md',
)

const requireGitHubRepository = value => {
  let repositoryUrl
  try {
    repositoryUrl = new URL(value)
  } catch {
    throw new Error('docs_dependency.repository must be an HTTPS GitHub repository URL')
  }
  const repositoryPath = repositoryUrl.pathname.replace(/\.git$/, '').replace(/^\//, '')
  const segments = repositoryPath.split('/').filter(Boolean)
  if (
    repositoryUrl.protocol !== 'https:'
    || repositoryUrl.hostname !== 'github.com'
    || segments.length !== 2
    || segments.some(segment => !/^[A-Za-z0-9_.-]+$/.test(segment))
  ) {
    throw new Error('docs_dependency.repository must be an HTTPS GitHub repository URL')
  }
  return segments.join('/')
}

export const resolveRuntimeDocsDependency = contract => {
  const dependency = contract?.docs_dependency
  if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency)) {
    throw new Error('docs_dependency mapping is required')
  }
  if (typeof dependency.ref !== 'string' || !/^[0-9a-f]{40}$/.test(dependency.ref)) {
    throw new Error('docs_dependency.ref must be an exact lowercase 40-character Git commit SHA')
  }
  return {
    repository: requireGitHubRepository(dependency.repository),
    ref: dependency.ref,
  }
}

export const validateRuntimeReadinessContract = contract => {
  if (contract?.status !== 'active' || contract.contract_version !== 1) {
    throw new Error('runtime readiness contract must be active v1')
  }
  resolveRuntimeDocsDependency(contract)
  return contract
}

export const readRuntimeReadinessContract = async () => {
  const source = await fs.readFile(runtimeReadinessContractPath, 'utf8')
  const label = path.relative(repoRoot, runtimeReadinessContractPath)
  const contract = validateRuntimeReadinessContract(parseFrontmatter(source, label))
  const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'))
  const expected = `https://codeload.github.com/${resolveRuntimeDocsDependency(contract).repository}/tar.gz/${contract.docs_dependency.ref}`
  if (pkg.dependencies?.['agentic-os'] !== expected) throw new Error('docs and runtime package pins must identify the same OS source revision')
  return contract
}

export const formatGitHubOutput = dependency => (
  `repository=${dependency.repository}\nref=${dependency.ref}\n`
)
