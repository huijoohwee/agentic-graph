import fs from 'node:fs'
import { TRAVEL_MESH_PLAN, bindCommerceProviderReleaseMetadata, validateProtectedConfiguration, validatePlan } from './travel-mesh-release-plan.mjs'
import { resourceReadiness, assertMeshSubdomainsDisabled } from './travel-mesh-release-inventory.mjs'
import { probeMesh } from './travel-mesh-release-probes.mjs'
import { CORE_RUNTIME_PLAN, validateCoreConfiguration, validateCoreOwnerAuthority } from './core-runtime-release-plan.mjs'
import { coreResourceReadiness, coreExposure, enrollCoreOwner } from './core-runtime-release-inventory.mjs'
import { probeCoreRuntime, probeCoreBaseline, probeRestoredCore } from './core-runtime-release-probes.mjs'

export const TRAVEL_RUNTIME_PROFILE = Object.freeze({
  id: 'travel', plan: TRAVEL_MESH_PLAN, requiresTravelBootstrap: true,
  schema: kind => `agentic-graph-travel-mesh-${kind}/${kind === 'probe-receipt' ? 'v1' : 'v2'}`,
  configure: (environment, metadata) => bindCommerceProviderReleaseMetadata(validateProtectedConfiguration(environment), metadata),
  resources: resourceReadiness, exposure: assertMeshSubdomainsDisabled,
  probe: (configuration, options) => probeMesh(configuration.variables.TRAVEL_MESH_PROBE_SPEC_JSON, options),
})
export const CORE_RUNTIME_PROFILE = Object.freeze({
  id: 'core', plan: CORE_RUNTIME_PLAN, requiresTravelBootstrap: false,
  schema: kind => `agentic-graph-core-runtime-${kind}/v1`,
  configure: validateCoreConfiguration, validateAuthority: validateCoreOwnerAuthority, initialize: enrollCoreOwner, resources: coreResourceReadiness, exposure: coreExposure, probe: probeCoreRuntime,
  probeBaseline: probeCoreBaseline, probeRestored: probeRestoredCore,
})

export const selectRuntimeProfile = value => {
  if (value?.schema !== 'agentic-graph-production-release-profile/v1'
    || Object.keys(value).sort().join(',') !== 'costPolicy,profile,schema'
    || value.costPolicy !== 'existing-free-resources-only'
    || !['core', 'travel'].includes(value.profile)) throw new Error('production release profile is invalid')
  validatePlan()
  return value.profile === 'core' ? CORE_RUNTIME_PROFILE : TRAVEL_RUNTIME_PROFILE
}
// No environment override: the selected profile belongs to the reviewed source
// tree, which is bound into the immutable candidate and human authorization.
export const readRuntimeProfile = () => selectRuntimeProfile(JSON.parse(fs.readFileSync(
  new URL('../config/production-release-profile.json', import.meta.url), 'utf8',
)))
