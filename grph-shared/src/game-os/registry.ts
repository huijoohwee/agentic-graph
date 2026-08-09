import { cloneCanonicalGameOsValue, compareGameOsText } from './canonical.js'
import { exactRecord, exactText } from './schema.js'
import { GameOsError, type GameOsJsonValue } from './types.js'

export type GameOsSurfaceContract = {
  overlayKind: string
}

export type GameOsOverlay = {
  overlayId: string
  overlayKind: string
  state?: GameOsJsonValue
}

export type GameOsModePersistenceObligation =
  | { continuity: 'required'; lease: 'single-writer' }
  | { continuity: 'none'; lease: 'none' }

export type GameOsModeDeclaration = {
  identity: string
  worldSchema: string
  persistence: GameOsModePersistenceObligation
  surface: GameOsSurfaceContract
  adaptInput(input: unknown): GameOsJsonValue
  createOverlay(input: GameOsJsonValue): GameOsOverlay
  exit(overlay: GameOsOverlay): void
}

export type GameOsModeSummary = {
  identity: string
  worldSchema: string
  persistence: GameOsModePersistenceObligation
  overlayKind: string
  active: boolean
}

const requiredText = (value: unknown, field: string): string => {
  try { return exactText(value, field) } catch {
    throw new GameOsError('input-invalid', `${field} is required.`, { field })
  }
}

const requiredDeclarationText = (value: unknown, field: string): string => {
  try { return exactText(value, field) } catch {
    throw new GameOsError('invalid_declaration', `Mode declaration ${field} is required.`, { field })
  }
}

const requiredOverlayText = (value: unknown, field: string): string => {
  try { return exactText(value, field) } catch {
    throw new GameOsError('surface_unavailable', `Mode overlay ${field} is required.`, { field })
  }
}

const normalizeOverlay = (overlay: GameOsOverlay, expectedKind: string): GameOsOverlay => {
  try { exactRecord(overlay, ['overlayId', 'overlayKind'], 'mode overlay', ['state']) } catch (error) {
    throw new GameOsError('surface_unavailable', 'Mode produced an invalid overlay shape.', {
      reason: error instanceof Error ? error.message : String(error),
    })
  }
  const overlayId = requiredOverlayText(overlay?.overlayId, 'overlayId')
  const overlayKind = requiredOverlayText(overlay?.overlayKind, 'overlayKind')
  if (overlayKind !== expectedKind) {
    throw new GameOsError('surface_unavailable', 'Mode produced an overlay outside its surface contract.', {
      expectedKind,
      receivedKind: overlayKind,
    })
  }
  try { return cloneCanonicalGameOsValue({ ...overlay, overlayId, overlayKind }) } catch (error) {
    throw new GameOsError('surface_unavailable', 'Mode overlay state is not canonical JSON.', {
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}

export class GameOsSurfaceOwnershipArbiter {
  private active: { identity: string; overlay: GameOsOverlay; exit: (overlay: GameOsOverlay) => void } | null = null

  claim(args: {
    identity: string
    overlay: GameOsOverlay
    exit(overlay: GameOsOverlay): void
  }): GameOsOverlay {
    const identity = requiredText(args.identity, 'identity')
    const incumbent = this.active
    if (incumbent) {
      try {
        incumbent.exit(cloneCanonicalGameOsValue(incumbent.overlay))
      } catch (error) {
        if (error instanceof GameOsError) throw error
        throw new GameOsError('surface_unavailable', 'The incumbent mode did not release the scene surface.', {
          identity: incumbent.identity,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }
    this.active = {
      identity,
      overlay: cloneCanonicalGameOsValue(args.overlay),
      exit: args.exit,
    }
    return cloneCanonicalGameOsValue(this.active.overlay)
  }

  release(identityValue: string): boolean {
    const identity = requiredText(identityValue, 'identity')
    if (!this.active || this.active.identity !== identity) return false
    const incumbent = this.active
    try {
      incumbent.exit(cloneCanonicalGameOsValue(incumbent.overlay))
    } catch (error) {
      if (error instanceof GameOsError) throw error
      throw new GameOsError('surface_unavailable', 'The active mode did not release the scene surface.', {
        identity: incumbent.identity,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
    this.active = null
    return true
  }

  inspect(): { identity: string; overlay: GameOsOverlay } | null {
    if (!this.active) return null
    return cloneCanonicalGameOsValue({ identity: this.active.identity, overlay: this.active.overlay })
  }

  get liveOverlayCount(): number {
    return this.active ? 1 : 0
  }
}

export class GameOsModeRegistry {
  private readonly modes = new Map<string, GameOsModeDeclaration>()

  constructor(private readonly arbiter = new GameOsSurfaceOwnershipArbiter()) {}

  registerMode(declaration: GameOsModeDeclaration): () => void {
    try {
      exactRecord(declaration, ['identity', 'worldSchema', 'persistence', 'surface',
        'adaptInput', 'createOverlay', 'exit'], 'mode declaration')
      exactRecord(declaration?.persistence, ['continuity', 'lease'], 'mode declaration persistence')
      exactRecord(declaration?.surface, ['overlayKind'], 'mode declaration surface')
    } catch (error) {
      throw new GameOsError('invalid_declaration', 'Mode declaration shape is invalid.', {
        reason: error instanceof Error ? error.message : String(error),
      })
    }
    const identity = requiredDeclarationText(declaration?.identity, 'identity')
    const worldSchema = requiredDeclarationText(declaration?.worldSchema, 'worldSchema')
    const overlayKind = requiredDeclarationText(declaration?.surface?.overlayKind, 'surface.overlayKind')
    if (this.modes.has(identity)) {
      throw new GameOsError('duplicate_identity', `Game mode ${identity} is already registered.`, { identity })
    }
    const persistentWorld = declaration?.persistence?.continuity === 'required'
      && declaration.persistence.lease === 'single-writer'
    const nonpersistentWorld = declaration?.persistence?.continuity === 'none'
      && declaration.persistence.lease === 'none'
    if (
      (!persistentWorld && !nonpersistentWorld)
      ||
      typeof declaration.adaptInput !== 'function'
      || typeof declaration.createOverlay !== 'function'
      || typeof declaration.exit !== 'function'
    ) {
      throw new GameOsError(
        'invalid_declaration',
        'A mode must declare its world schema, persistence obligations, input, overlay, and exit handlers.',
      )
    }
    const admitted: GameOsModeDeclaration = {
      ...declaration,
      identity,
      worldSchema,
      persistence: persistentWorld
        ? { continuity: 'required', lease: 'single-writer' }
        : { continuity: 'none', lease: 'none' },
      surface: { overlayKind },
    }
    this.modes.set(identity, admitted)
    let registered = true
    return () => {
      if (!registered) return
      this.arbiter.release(identity)
      this.modes.delete(identity)
      registered = false
    }
  }

  activate(identityValue: string, input: unknown): GameOsOverlay {
    const identity = requiredText(identityValue, 'identity')
    const declaration = this.modes.get(identity)
    if (!declaration) {
      throw new GameOsError('surface_unavailable', `Game mode ${identity} is not registered.`, { identity })
    }
    let adapted: GameOsJsonValue
    try {
      adapted = cloneCanonicalGameOsValue(declaration.adaptInput(input))
    } catch (error) {
      if (error instanceof GameOsError) throw error
      throw new GameOsError('surface_unavailable', `Mode ${identity} input adaptation failed.`, {
        identity, reason: error instanceof Error ? error.message : String(error),
      })
    }
    let created: GameOsOverlay
    try {
      created = declaration.createOverlay(cloneCanonicalGameOsValue(adapted))
    } catch (error) {
      if (error instanceof GameOsError) throw error
      throw new GameOsError('surface_unavailable', `Mode ${identity} overlay creation failed.`, {
        identity, reason: error instanceof Error ? error.message : String(error),
      })
    }
    const overlay = normalizeOverlay(created, declaration.surface.overlayKind)
    return this.arbiter.claim({ identity, overlay, exit: declaration.exit })
  }

  deactivate(identityValue: string): boolean {
    return this.arbiter.release(identityValue)
  }

  listModes(): GameOsModeSummary[] {
    const activeIdentity = this.arbiter.inspect()?.identity ?? null
    return Array.from(this.modes.values())
      .map(mode => ({
        identity: mode.identity,
        worldSchema: mode.worldSchema,
        persistence: { ...mode.persistence },
        overlayKind: mode.surface.overlayKind,
        active: mode.identity === activeIdentity,
      }))
      .sort((left, right) => compareGameOsText(left.identity, right.identity))
  }

  inspectSurface(): { identity: string; overlay: GameOsOverlay } | null {
    return this.arbiter.inspect()
  }

  get liveOverlayCount(): number {
    return this.arbiter.liveOverlayCount
  }
}
