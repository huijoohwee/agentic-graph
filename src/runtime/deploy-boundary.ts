export type DeployBoundaryReport = Readonly<{
  lane: string
  boundaries: readonly Readonly<{
    name: string
    state: 'closed'
    evidenceReference: null
    rollback: string
  }>[]
}>

export function deployBoundaryReport(env: Pick<TravelCommerceEnv, 'DEPLOY_LANE'>): DeployBoundaryReport {
  return Object.freeze({
    lane: env.DEPLOY_LANE,
    boundaries: Object.freeze([
      Object.freeze({
        name: 'Bundle_Commit_Deploy_Boundary', state: 'closed' as const, evidenceReference: null,
        rollback: 'Restore the last committed SQLite snapshot for the affected set.',
      }),
      Object.freeze({
        name: 'Envelope_Mutation_Deploy_Boundary', state: 'closed' as const, evidenceReference: null,
        rollback: 'Transition every reserved cascade hold to released.',
      }),
      Object.freeze({
        name: 'Mirror_Delivery_Deploy_Boundary', state: 'closed' as const, evidenceReference: null,
        rollback: 'No production mutation is authorized from this Dev configuration.',
      }),
    ]),
  })
}
