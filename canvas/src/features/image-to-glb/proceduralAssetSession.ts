import { parseProceduralAssetRecipe, updateProceduralAssetControl, type AssetControlValue, type ProceduralAssetRecipe } from './proceduralAssetContract'
import { buildProceduralAsset, disposeProceduralAsset, type ProceduralAssetBuild } from './proceduralAssetBuilder'

export type ProceduralAssetDocument = { documentId: string; revision: number; lastValid: ProceduralAssetRecipe; draft: string | null; error: string | null }
export type ProceduralAssetTicket = { documentId: string; revision: number; generation: number; sessionId: symbol }
/** Document-bound construction helper, not an XR selection store or animation clock. */
export class ProceduralAssetSession {
  private state: ProceduralAssetDocument
  private build: ProceduralAssetBuild
  private generation = 0
  private readonly sessionId = Symbol('procedural-asset-session')
  private disposed = false
  constructor(documentId: string, recipe: unknown, revision = 0) {
    if (!documentId.trim() || documentId.length > 1024 || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid procedural document identity')
    this.build = buildProceduralAsset(recipe)
    this.state = { documentId, revision, lastValid: this.build.recipe, draft: null, error: null }
  }
  get snapshot(): ProceduralAssetDocument { return JSON.parse(JSON.stringify(this.state)) as ProceduralAssetDocument }
  get current(): ProceduralAssetBuild {
    this.assertActive()
    return { ...this.build, recipe: parseProceduralAssetRecipe(this.build.recipe), evidence: { ...this.build.evidence } }
  }
  private assertActive(): void { if (this.disposed) throw new Error('Procedural document is closed') }
  begin(): ProceduralAssetTicket {
    this.assertActive()
    return { documentId: this.state.documentId, revision: this.state.revision, generation: ++this.generation, sessionId: this.sessionId }
  }
  isCurrent(ticket: ProceduralAssetTicket): boolean {
    return !this.disposed && ticket.sessionId === this.sessionId && ticket.documentId === this.state.documentId && ticket.revision === this.state.revision && ticket.generation === this.generation
  }
  cancel(): void { this.generation += 1 }
  /** Admission completes before replacing owned GPU resources or persisted state. */
  apply(draft: string, ticket = this.begin()): boolean {
    if (!this.isCurrent(ticket)) return false
    if (new TextEncoder().encode(draft).length > 65_536) {
      this.state = { ...this.state, error: 'Draft exceeds 64 kB; previous recoverable draft and asset retained' }
      return false
    }
    try {
      const next = buildProceduralAsset(draft)
      if (!this.isCurrent(ticket)) { disposeProceduralAsset(next.scene); return false }
      const previous = this.build; this.build = next
      this.state = { ...this.state, revision: this.state.revision + 1, lastValid: next.recipe, draft: null, error: null }
      this.generation += 1; disposeProceduralAsset(previous.scene)
      return true
    } catch (error) {
      this.state = { ...this.state, draft, error: error instanceof Error ? error.message : 'Invalid procedural recipe' }
      return false
    }
  }
  setControl(id: string, value?: AssetControlValue): boolean {
    return this.apply(JSON.stringify(updateProceduralAssetControl(this.state.lastValid, id, value)))
  }
  serialize(): string { return `${JSON.stringify(this.state, null, 2)}\n` }
  static restore(text: string): ProceduralAssetSession {
    if (new TextEncoder().encode(text).length > 196_608) throw new Error('Procedural document exceeds recovery budget')
    const data = JSON.parse(text) as ProceduralAssetDocument
    if (typeof data.documentId !== 'string' || data.draft !== null && typeof data.draft !== 'string' || data.error !== null && typeof data.error !== 'string') throw new Error('Invalid procedural document')
    const session = new ProceduralAssetSession(data.documentId, parseProceduralAssetRecipe(data.lastValid), data.revision)
    session.state.draft = data.draft; session.state.error = data.error
    return session
  }
  dispose(): void { if (!this.disposed) { this.cancel(); this.disposed = true; disposeProceduralAsset(this.build.scene) } }
}
