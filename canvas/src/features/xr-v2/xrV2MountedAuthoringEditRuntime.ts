import React from 'react'
import type { Group } from 'three'
import type { XrAuthoringRenderPlan } from './authoringRenderPlan'
import { waitForXrV2MountedAuthoringVisibilityCommit } from './xrV2MountedAuthoringEditCommit'

export const XR_V2_MOUNTED_AUTHORING_EDIT_SCHEMA =
  'knowgrph-xr-v2-mounted-authoring-edit/v1' as const

export type XrV2MountedAuthoringEdit = Readonly<{
  schema: typeof XR_V2_MOUNTED_AUTHORING_EDIT_SCHEMA
  entityRef: string
  visible: boolean
  sourceDigest: string
  graphDataRevision: number
  authoringEditRevision: number
  authorRenderedAtMs: number
  attached: true
}>

type EditTarget = Readonly<{
  token: symbol
  sourceDigest: string
  graphDataRevision: number
  applyVisibility(
    entityRef: string,
    visible: boolean,
    revision: number,
    signal: AbortSignal,
  ): Promise<Readonly<{ visible: boolean; renderedAtMs: number; attached: true }>>
}>

const ENTITY_REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const SOURCE_DIGEST = /^fnv1a32:[0-9a-f]{8}$/
let target: EditTarget | null = null
let editRevision = 0

export function registerXrV2MountedAuthoringEditTarget(input: Readonly<{
  sourceDigest: string
  graphDataRevision: number
  applyVisibility: EditTarget['applyVisibility']
}>): () => void {
  if (!SOURCE_DIGEST.test(input.sourceDigest)
    || !Number.isSafeInteger(input.graphDataRevision) || input.graphDataRevision < 0
    || typeof input.applyVisibility !== 'function') {
    throw new Error('Mounted authoring edit target identity is invalid')
  }
  const token = Symbol('xr-v2-mounted-authoring-edit-target')
  target = Object.freeze({ token, ...input })
  editRevision = 0
  return () => {
    if (target?.token !== token) return
    target = null
    editRevision = 0
  }
}

export async function applyXrV2MountedAuthoringVisibilityEdit(input: Readonly<{
  entityRef: string
  visible: boolean
  sourceDigest: string
  graphDataRevision: number
  signal: AbortSignal
}>): Promise<XrV2MountedAuthoringEdit> {
  if (!ENTITY_REF.test(input.entityRef) || typeof input.visible !== 'boolean'
    || !SOURCE_DIGEST.test(input.sourceDigest)
    || !Number.isSafeInteger(input.graphDataRevision) || input.graphDataRevision < 0) {
    throw new Error('Mounted authoring visibility edit is malformed')
  }
  if (input.signal.aborted) throw new DOMException('Mounted authoring edit was cancelled', 'AbortError')
  const active = target
  if (!active || active.sourceDigest !== input.sourceDigest
    || active.graphDataRevision !== input.graphDataRevision) {
    throw new Error('Mounted authoring edit target does not match the active source')
  }
  const revision = editRevision + 1
  const rendered = await active.applyVisibility(
    input.entityRef, input.visible, revision, input.signal,
  )
  if (input.signal.aborted) throw new DOMException('Mounted authoring edit was cancelled', 'AbortError')
  if (target !== active || rendered.visible !== input.visible || !rendered.attached
    || !Number.isFinite(rendered.renderedAtMs) || rendered.renderedAtMs < 0) {
    throw new Error('Mounted authoring visibility edit was not rendered by its source target')
  }
  editRevision = revision
  return Object.freeze({
    schema: XR_V2_MOUNTED_AUTHORING_EDIT_SCHEMA,
    entityRef: input.entityRef,
    visible: input.visible,
    sourceDigest: input.sourceDigest,
    graphDataRevision: input.graphDataRevision,
    authoringEditRevision: revision,
    authorRenderedAtMs: rendered.renderedAtMs,
    attached: true,
  })
}

export function useRegisterXrV2MountedAuthoringEditTarget(input: Readonly<{
  rootRef: React.RefObject<Group | null>
  plan: XrAuthoringRenderPlan
  setVisibleByEntityId: (
    updater: (current: Readonly<Record<number, boolean>>) => Readonly<Record<number, boolean>>,
  ) => void
}>): void {
  const { plan, rootRef, setVisibleByEntityId } = input
  React.useLayoutEffect(() => registerXrV2MountedAuthoringEditTarget({
    sourceDigest: plan.sourceDigest,
    graphDataRevision: plan.graphDataRevision,
    applyVisibility: (entityRef, visible, revision, signal) => {
      const entity = plan.entities.find(candidate => candidate.entityRef === entityRef)
      if (!entity?.renderable) return Promise.reject(new Error('Mounted authoring entity is not editable'))
      setVisibleByEntityId(current => ({ ...current, [entity.entityId]: visible }))
      return waitForXrV2MountedAuthoringVisibilityCommit({
        visible,
        revision,
        signal,
        readTarget: () => {
          const root = rootRef.current
          const mesh = root?.getObjectByName(`kg_xr_v2_mesh:${entityRef}`)
          return mesh ? Object.freeze({
            attached: Boolean(root?.parent),
            visible: mesh.visible,
            markRendered: (nextRevision: number) => { mesh.userData.xrAuthoringEditRevision = nextRevision },
          }) : null
        },
      })
    },
  }), [plan, rootRef, setVisibleByEntityId])
}
