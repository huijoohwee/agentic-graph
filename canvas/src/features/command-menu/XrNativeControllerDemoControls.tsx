import React from 'react'
import { Gamepad2, Gauge, Rocket, RotateCcw } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  buildXrPhysicsInvocation,
} from '@/features/three/xrSceneMcpContract.mjs'
import {
  readXrNativeControllerDemo,
  subscribeXrNativeControllerDemo,
  type XrNativeControllerDemoMode,
} from '@/features/three/xrNativeControllerDemoRuntime'
import type {
  XrPhysicsControlInput,
  XrPhysicsOperation,
} from '@/features/three/xrSceneInteractiveInvocation'
import type { XrSceneControlInput } from '@/features/three/xrSceneMcpRuntime'

type ControllerOperation = Extract<XrPhysicsOperation, 'develop-run' | 'pause' | 'resume' | 'reset' | 'exit' | 'select'>

function DemoButton({
  active = false,
  children,
  disabled = false,
  marker,
  onClick,
}: {
  active?: boolean
  children: React.ReactNode
  disabled?: boolean
  marker: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn('App-toolbar__btn min-w-0 gap-1 font-semibold', active ? UI_THEME_TOKENS.button.activeBg : '')}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      data-kg-xr-native-controller-action={marker}
    >
      {children}
    </button>
  )
}

export function XrNativeControllerDemoControls({
  sceneReady,
  runControl,
}: {
  sceneReady: boolean
  runControl: (input: XrSceneControlInput) => unknown
}) {
  const runtime = React.useSyncExternalStore(
    subscribeXrNativeControllerDemo,
    readXrNativeControllerDemo,
    readXrNativeControllerDemo,
  )
  const dispatch = React.useCallback((
    operation: ControllerOperation,
    controllerMode?: XrNativeControllerDemoMode,
  ) => {
    const physics: XrPhysicsControlInput = {
      scope: 'controller',
      operation,
      ...(controllerMode ? { controllerMode } : {}),
    }
    runControl({ action: 'physics', physics })
  }, [runControl])
  const chooseMode = (mode: XrNativeControllerDemoMode) => {
    dispatch(runtime.phase === 'off' ? 'develop-run' : 'select', mode)
  }
  const invocation = buildXrPhysicsInvocation('controller', 'develop-run', { mode: runtime.mode })
  const active = runtime.phase !== 'off'
  return (
    <section
      className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
      aria-label="Native XR controller demo"
      data-kg-xr-native-controller-demo="1"
      data-kg-xr-native-controller-phase={runtime.phase}
      data-kg-xr-native-controller-mode={runtime.mode}
      data-kg-xr-native-controller-runtime="local-clean-room"
    >
      <header className="flex items-start justify-between gap-2">
        <span className="grid min-w-0 gap-0.5">
          <strong className="text-xs uppercase">Native Controller Lab</strong>
          <span className={cn('text-xs', UI_THEME_TOKENS.text.tertiary)}>
            Procedural assets · deterministic {runtime.fixedRateHz} Hz · smooth follow camera
          </span>
        </span>
        <output
          className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold uppercase', active ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : UI_THEME_TOKENS.text.tertiary)}
          data-kg-xr-native-controller-status="1"
        >
          {runtime.phase}
        </output>
      </header>

      <DemoButton
        active={runtime.phase === 'running'}
        disabled={!sceneReady}
        marker="develop-run"
        onClick={() => dispatch('develop-run', runtime.mode)}
      >
        <Gauge className="size-3.5" aria-hidden />Develop &amp; Run
      </DemoButton>

      <nav className="grid grid-cols-2 gap-1" aria-label="Native XR controller selection">
        <DemoButton active={active && runtime.mode === 'ball'} disabled={!sceneReady} marker="select-ball" onClick={() => chooseMode('ball')}>
          <span aria-hidden>●</span>Ball
        </DemoButton>
        <DemoButton active={active && runtime.mode === 'rocket'} disabled={!sceneReady} marker="select-rocket" onClick={() => chooseMode('rocket')}>
          <Rocket className="size-3.5" aria-hidden />Rocket
        </DemoButton>
      </nav>

      <nav className="grid grid-cols-4 gap-1" aria-label="Native XR controller transport">
        <DemoButton disabled={!sceneReady || runtime.phase !== 'running'} marker="pause" onClick={() => dispatch('pause')}>Pause</DemoButton>
        <DemoButton disabled={!sceneReady || (runtime.phase !== 'paused' && runtime.phase !== 'ready')} marker="resume" onClick={() => dispatch('resume')}>Resume</DemoButton>
        <DemoButton disabled={!sceneReady || runtime.phase === 'off'} marker="reset" onClick={() => dispatch('reset')}><RotateCcw className="size-3" aria-hidden />Reset</DemoButton>
        <DemoButton disabled={!sceneReady || runtime.phase === 'off'} marker="exit" onClick={() => dispatch('exit')}>Exit</DemoButton>
      </nav>

      <section className={cn('grid grid-cols-2 gap-2 rounded p-1.5 text-xs', UI_THEME_TOKENS.panel.bg)} aria-label="Native XR controller input map">
        <span><kbd>WASD</kbd> / arrows<br /><span className={UI_THEME_TOKENS.text.tertiary}>Move · tilt · boosters</span></span>
        <span><kbd>Space</kbd> + <kbd>Shift</kbd><br /><span className={UI_THEME_TOKENS.text.tertiary}>Jump/thrust · torque/stabilize</span></span>
        <span className="col-span-2 inline-flex items-center gap-1"><Gamepad2 className="size-3" aria-hidden />Standard gamepad: left stick · south button · shoulder</span>
      </section>

      <code
        className={cn('block overflow-hidden text-ellipsis whitespace-nowrap rounded px-1.5 py-1 text-xs', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.text.tertiary)}
        title={invocation}
        data-kg-xr-native-controller-invocation={invocation}
      >
        {invocation}
      </code>
    </section>
  )
}
