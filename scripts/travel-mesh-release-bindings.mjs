import fs from 'node:fs'
import path from 'node:path'
import { SENTINEL, digest, repoRoot, requireText } from './travel-mesh-release-plan.mjs'

const candidateTag = sourceSha => `agenticgraph-${sourceSha}`
const candidateMessage = (sourceSha, candidateDigest) => `agenticgraph candidate ${sourceSha} ${candidateDigest}`

export const versionBindings = (value, label) => {
  if (!Array.isArray(value?.resources?.bindings)) throw new Error(`${label} binding inventory is malformed`)
  const bindings = new Map()
  for (const binding of value.resources.bindings) {
    const name = requireText(binding?.name, `${label} binding name`)
    if (bindings.has(name) || typeof binding.type !== 'string') throw new Error(`${label} binding inventory is duplicated or malformed`)
    bindings.set(name, binding)
  }
  return bindings
}

export const secretBindingNames = (value, label) => [...versionBindings(value, label).values()]
  .filter(binding => binding.type === 'secret_text').map(binding => binding.name).sort()

const managedBindingNames = (entry, configuration) => new Set([
  ...entry.secrets.map(([name]) => name),
  ...Object.keys(configuration.overrides[entry.id]),
  ...Object.keys(configuration.serviceTargets[entry.id]),
  ...entry.bindingProofs.map(([name]) => name),
])

export const bindingInventory = (value, label) => {
  const bindings = versionBindings(value, label)
  const summaries = [...bindings.values()].map(binding => ({ name: binding.name, type: binding.type }))
    .sort((left, right) => left.name.localeCompare(right.name))
  return { digest: digest([...bindings.values()].sort((left, right) => left.name.localeCompare(right.name))), bindings: summaries }
}

export const assertReleaseConfigPreservesBaseline = (config, baselineVersion, entry, configuration) => {
  const source = fs.readFileSync(path.resolve(repoRoot, config), 'utf8')
  const managed = managedBindingNames(entry, configuration)
  for (const binding of versionBindings(baselineVersion, `${entry.id} baseline`).values()) {
    if (managed.has(binding.name) || binding.type === 'secret_text' || binding.type === 'plain_text') continue
    const escaped = binding.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const bindingField = new RegExp(`["']?(?:binding|name)["']?\\s*(?:=|:)\\s*["']${escaped}["']`)
    const variableKey = new RegExp(`(?:^|\\n)\\s*["']?${escaped}["']?\\s*(?:=|:)`)
    if (!bindingField.test(source) && !variableKey.test(source)) {
      throw new Error(`${entry.id} release config would drop unmanaged baseline binding ${binding.name}`)
    }
  }
}

export const verifyCandidateVersion = (value, entry, sourceSha, candidateDigest, configuration, baselineVersion,
  preservedSecretNameDigest) => {
  if (typeof value?.id !== 'string' || value.annotations?.['workers/tag'] !== candidateTag(sourceSha)
    || value.annotations?.['workers/message'] !== candidateMessage(sourceSha, candidateDigest)) {
    throw new Error(`${entry.id} uploaded version is not bound to the exact candidate`)
  }
  if (SENTINEL.test(JSON.stringify(value))) throw new Error(`${entry.id} uploaded version contains a production sentinel`)
  const bindings = versionBindings(value, `${entry.id} candidate`)
  const baselineBindings = versionBindings(baselineVersion, `${entry.id} baseline`)
  const baselineSecrets = secretBindingNames(baselineVersion, `${entry.id} baseline`)
  if (digest(baselineSecrets) !== preservedSecretNameDigest) throw new Error(`${entry.id} preserved secret-name digest drifted`)
  const managed = managedBindingNames(entry, configuration)
  const expectedNames = [...new Set([...baselineBindings.keys(), ...managed])].sort()
  const actualNames = [...bindings.keys()].sort()
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`${entry.id} candidate binding inventory is not the exact baseline-plus-managed allowlist`)
  }
  for (const [name, baseline] of baselineBindings) {
    if (!managed.has(name) && digest(bindings.get(name)) !== digest(baseline)) {
      throw new Error(`${entry.id} unmanaged baseline binding ${name} changed`)
    }
  }
  const expectedSecrets = [...new Set([...baselineSecrets, ...entry.secrets.map(([binding]) => binding)])].sort()
  const actualSecrets = [...bindings.values()].filter(binding => binding.type === 'secret_text').map(binding => binding.name).sort()
  if (JSON.stringify(actualSecrets) !== JSON.stringify(expectedSecrets)) throw new Error(`${entry.id} candidate secret bindings are not exact`)
  for (const [name, expected] of Object.entries(configuration.overrides[entry.id])) {
    const binding = bindings.get(name)
    if (binding?.type !== 'plain_text' || binding.text !== expected) throw new Error(`${entry.id} protected variable ${name} did not bind exactly`)
  }
  for (const [name, expected] of Object.entries(configuration.serviceTargets[entry.id])) {
    const binding = bindings.get(name)
    if (binding?.type !== 'service' || binding.service !== expected) throw new Error(`${entry.id} protected service ${name} did not bind exactly`)
    const expectedEntrypoint = entry.serviceTargets.find(([bindingName]) => bindingName === name)?.[3]
    if ((binding.entrypoint ?? null) !== (expectedEntrypoint ?? null)) throw new Error(`${entry.id} protected service ${name} entrypoint did not bind exactly`)
  }
  for (const [name, type, envName, field] of entry.bindingProofs) {
    const binding = bindings.get(name)
    if (binding?.type !== type || binding[field] !== configuration.variables[envName]) throw new Error(`${entry.id} protected resource ${name} did not bind exactly`)
  }
  return digest(value)
}
