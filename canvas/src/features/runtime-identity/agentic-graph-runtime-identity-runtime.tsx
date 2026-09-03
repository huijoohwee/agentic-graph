import { useEffect } from 'react'
import {
  useAgenticOsRemoteGrammarCatalog,
  type AgenticOsRemoteGrammarSigil,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { publishAgenticGraphAgenticOsIdentity, useAgenticGraphRuntimeIdentity } from './agentic-graph-runtime-identity'
import { useAgenticGraphRuntimeIdentityAttestationRuntime } from './use-agentic-graph-runtime-identity-attestation-runtime'

const CATALOG_IDENTITY_SIGILS: readonly AgenticOsRemoteGrammarSigil[] = ['/', '#', '@']

/** Owns application identity globally; docs catalog, provider proof, and progressive readiness are source-backed facets. */
export function AgenticGraphRuntimeIdentityRuntime() {
  const catalogSnapshot = useAgenticOsRemoteGrammarCatalog({ sigils: CATALOG_IDENTITY_SIGILS })
  const identity = useAgenticGraphRuntimeIdentity()

  useEffect(() => {
    publishAgenticGraphAgenticOsIdentity(catalogSnapshot)
  }, [catalogSnapshot])
  useAgenticGraphRuntimeIdentityAttestationRuntime(identity)

  return null
}
