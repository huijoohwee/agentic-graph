import { useEffect } from 'react'
import {
  useAgenticOsRemoteGrammarCatalog,
  type AgenticOsRemoteGrammarSigil,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { publishKnowgrphAgenticOsIdentity, useKnowgrphRuntimeIdentity } from './knowgrphRuntimeIdentity'
import { useKnowgrphRuntimeIdentityAttestationRuntime } from './useKnowgrphRuntimeIdentityAttestationRuntime'

const CATALOG_IDENTITY_SIGILS: readonly AgenticOsRemoteGrammarSigil[] = ['/', '#', '@']

/** Owns application identity globally; docs catalog, provider proof, and progressive readiness are source-backed facets. */
export function KnowgrphRuntimeIdentityRuntime() {
  const catalogSnapshot = useAgenticOsRemoteGrammarCatalog({ sigils: CATALOG_IDENTITY_SIGILS })
  const identity = useKnowgrphRuntimeIdentity()

  useEffect(() => {
    publishKnowgrphAgenticOsIdentity(catalogSnapshot)
  }, [catalogSnapshot])
  useKnowgrphRuntimeIdentityAttestationRuntime(identity)

  return null
}
