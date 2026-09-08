from __future__ import annotations

from playwright.sync_api import Page


def assert_shared_npc_highlight(page: Page, *, game_active: bool) -> dict[str, object]:
    """Inspect the rendered scene; selection must not start inactive simulation."""
    result = page.evaluate(
        """
        async ({ gameActive }) => {
          const controls = await import('/src/features/three/xrSharedAssetControlRuntime.ts')
          const game = await import('/src/features/game-fps/gameFpsRuntime.ts')
          const mode = await import('/src/features/game-fps/gameModeRuntime.ts')
          const store = await import('/src/hooks/useGraphStore.ts')
          const before = controls.inspectXrSharedAssetControls()
          const restoreId = before.selectedTargetId || before.targets.find(target => target.kind === 'scene')?.id
          if (!restoreId) throw new Error('No prior scene target to restore')
          const npcId = 'npc-scout'
          const initialTick = game.readGameFpsSnapshot().tick
          const selected = controls.controlXrSharedAssetControls({ operation: 'select-target', targetId: npcId })
          if (!selected.ok) throw new Error(selected.message)
          const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          try {
            await frame()
            const blob = await store.useGraphStore.getState().captureThreeGltfSnapshot()
            if (!blob) throw new Error('No rendered scene snapshot')
            const nodes = JSON.parse(await blob.text()).nodes || []
            const highlights = nodes.filter(node => String(node.name || '').startsWith('agentic_os_game_fps_npc_shared_highlight_'))
            const groups = nodes.filter(node => node.name === 'agentic_os_game_fps_shared_npc_highlights')
            const highlight = highlights[0]
            if (groups.length !== 1 || highlights.length !== 1 || highlight.name !== `agentic_os_game_fps_npc_shared_highlight_${npcId}`) {
              throw new Error(`Expected one selected NPC outline, groups=${groups.length}, highlights=${highlights.map(node => node.name)}`)
            }
            const transform = node => ({
              translation: node.translation || [0, 0, 0], rotation: node.rotation || [0, 0, 0, 1],
              scale: node.scale || [1, 1, 1], matrix: node.matrix || null,
            })
            if (gameActive) {
              const npc = nodes.find(node => node.name === `agentic_os_game_fps_npc_${npcId}`)
              if (!npc || JSON.stringify(transform(npc)) !== JSON.stringify(transform(highlight))) {
                throw new Error('Active selection outline did not copy the rendered NPC pose')
              }
              const mission = nodes.find(node => node.name === 'agentic_os_game_fps_mission')
              if (!mission?.children?.includes(nodes.indexOf(groups[0])) || !groups[0].children?.includes(nodes.indexOf(highlight))) {
                throw new Error('Active outline is not owned by the existing mission subtree')
              }
            } else {
              const npc = game.readGameFpsSnapshot().npcs.find(npc => npc.id === npcId)
              const translation = highlight.translation || highlight.matrix?.slice(12, 15) || [0, 0, 0]
              if (!npc || translation.length !== 3 || translation.some((value, index) => Math.abs(value - [npc.x, 0.9, npc.z][index]) > 1e-6)) {
                throw new Error(`Inactive selection outline did not use the canonical NPC position: ${JSON.stringify({ translation, npc })}`)
              }
              if (game.readGameFpsSnapshot().tick !== initialTick) throw new Error('Inactive selection advanced gameplay')
            }
            if (mode.readGameModeSnapshot().active !== gameActive) throw new Error('Selection changed Game Mode activation')
            return { gameActive, selectedNpcId: npcId, outlineCount: highlights.length, transform: transform(highlight), inactiveTickStable: gameActive ? null : true }
          } finally {
            const restored = controls.controlXrSharedAssetControls({ operation: 'select-target', targetId: restoreId })
            if (!restored.ok) throw new Error(`Could not restore selection: ${restored.message}`)
            await frame()
          }
        }
        """,
        {"gameActive": game_active},
    )
    return result
