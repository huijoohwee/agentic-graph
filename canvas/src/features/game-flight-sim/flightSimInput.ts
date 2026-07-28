import {
  FLIGHT_SIM_NEUTRAL_INPUT,
  stageFlightSimInputPatch,
  type FlightSimInputPatch,
  type FlightSimTickInput,
} from './flightSimModel'

export type FlightSimTouchControl = 'pitch-up' | 'pitch-down' | 'roll-left' | 'roll-right'
  | 'yaw-left' | 'yaw-right' | 'throttle-up' | 'throttle-down'

export type StandardGamepadLike = Readonly<{
  connected?: boolean
  mapping?: string
  axes: readonly number[]
  buttons: readonly Readonly<{ value: number; pressed?: boolean }>[]
}>

export type FlightSimInputBinding = Readonly<{
  consumeInput: () => FlightSimTickInput
  requestPointerLock: () => Promise<void>
  dispose: () => void
}>

export const FLIGHT_SIM_POINTER_CAPTURE_REQUEST_EVENT =
  'kg:flight-sim:pointer-capture-request'

export function requestFlightSimPointerCapture(): void {
  window.dispatchEvent(new Event(FLIGHT_SIM_POINTER_CAPTURE_REQUEST_EVENT))
}

const CAMERA_CYCLE_CODE = 'KeyC'

const CONTROL_CODES = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ControlLeft',
  'ControlRight',
  'KeyA',
  'KeyD',
  'KeyE',
  'KeyQ',
  'KeyS',
  'KeyW',
  'ShiftLeft',
  'ShiftRight',
])

const GAMEPAD_DEAD_ZONE = 0.12
let touchInput = FLIGHT_SIM_NEUTRAL_INPUT

function digital(positive: boolean, negative: boolean): number {
  return Number(positive) - Number(negative)
}

function deadZone(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return numeric
  if (Math.abs(numeric) <= GAMEPAD_DEAD_ZONE) return 0
  const magnitude = (Math.abs(numeric) - GAMEPAD_DEAD_ZONE) / (1 - GAMEPAD_DEAD_ZONE)
  return Math.sign(numeric) * magnitude
}

function buttonValue(gamepad: StandardGamepadLike, index: number): number {
  const button = gamepad.buttons[index]
  if (!button) return 0
  const numeric = Number(button.value)
  if (!Number.isFinite(numeric)) return numeric
  return button.pressed ? Math.max(numeric, 1) : numeric
}

export function updateFlightSimPressedCode(
  pressedCodes: Set<string>,
  code: string,
  pressed: boolean,
): boolean {
  if (!CONTROL_CODES.has(code)) return false
  if (pressed) {
    const previousSize = pressedCodes.size
    pressedCodes.add(code)
    return pressedCodes.size !== previousSize
  }
  return pressedCodes.delete(code)
}

export function isFlightSimCameraCycleCode(code: string): boolean {
  return code === CAMERA_CYCLE_CODE
}

export function flightSimInputFromPressedCodes(codes: ReadonlySet<string>): FlightSimTickInput {
  return stageFlightSimInputPatch(FLIGHT_SIM_NEUTRAL_INPUT, {
    pitch: digital(
      codes.has('KeyW') || codes.has('ArrowUp'),
      codes.has('KeyS') || codes.has('ArrowDown'),
    ),
    roll: digital(
      codes.has('KeyD') || codes.has('ArrowRight'),
      codes.has('KeyA') || codes.has('ArrowLeft'),
    ),
    yaw: digital(codes.has('KeyQ'), codes.has('KeyE')),
    throttleDelta: digital(
      codes.has('ShiftLeft') || codes.has('ShiftRight'),
      codes.has('ControlLeft') || codes.has('ControlRight'),
    ),
  })
}

export function flightSimInputFromHeldTouches(
  heldTouches: ReadonlyMap<number, FlightSimTouchControl>,
): FlightSimTickInput {
  const controls = new Set(heldTouches.values())
  return stageFlightSimInputPatch(FLIGHT_SIM_NEUTRAL_INPUT, {
    pitch: digital(controls.has('pitch-up'), controls.has('pitch-down')),
    roll: digital(controls.has('roll-right'), controls.has('roll-left')),
    yaw: digital(controls.has('yaw-left'), controls.has('yaw-right')),
    throttleDelta: digital(controls.has('throttle-up'), controls.has('throttle-down')),
  })
}

export function setFlightSimTouchInput(value: FlightSimInputPatch): FlightSimTickInput {
  touchInput = stageFlightSimInputPatch(FLIGHT_SIM_NEUTRAL_INPUT, value)
  return touchInput
}

export function readFlightSimTouchInput(): FlightSimTickInput {
  return touchInput
}

export function releaseFlightSimHeldTouch(
  heldTouches: Map<number, FlightSimTouchControl>,
  event?: Pick<PointerEvent, 'pointerId'>,
): void {
  if (event) heldTouches.delete(event.pointerId)
  else heldTouches.clear()
}

export function flightSimInputFromPointerDelta(
  movementX: unknown,
  movementY: unknown,
): FlightSimTickInput {
  const x = Number(movementX)
  const y = Number(movementY)
  return stageFlightSimInputPatch(FLIGHT_SIM_NEUTRAL_INPUT, {
    pitch: -y * 0.018,
    yaw: -x * 0.014,
  })
}

export function flightSimInputFromStandardGamepad(
  gamepad: StandardGamepadLike | null | undefined,
): FlightSimTickInput {
  if (!gamepad || gamepad.connected === false || (gamepad.mapping && gamepad.mapping !== 'standard')) {
    return FLIGHT_SIM_NEUTRAL_INPUT
  }
  const leftShoulder = buttonValue(gamepad, 4)
  const rightShoulder = buttonValue(gamepad, 5)
  const leftTrigger = buttonValue(gamepad, 6)
  const rightTrigger = buttonValue(gamepad, 7)
  return stageFlightSimInputPatch(FLIGHT_SIM_NEUTRAL_INPUT, {
    pitch: -deadZone(gamepad.axes[1] ?? 0),
    roll: deadZone(gamepad.axes[0] ?? 0),
    yaw: leftShoulder - rightShoulder,
    throttleDelta: rightTrigger - leftTrigger,
  })
}

export function readStandardFlightSimGamepad(
  navigatorValue: Pick<Navigator, 'getGamepads'> | null = typeof navigator === 'undefined' ? null : navigator,
): FlightSimTickInput {
  const gamepads = navigatorValue?.getGamepads?.()
  const gamepad = gamepads ? [...gamepads].find(value => value?.connected && value.mapping === 'standard') : null
  return flightSimInputFromStandardGamepad(gamepad)
}

export function mergeFlightSimInputs(inputs: readonly FlightSimInputPatch[]): FlightSimTickInput {
  const selectLargestMagnitude = (values: readonly (number | undefined)[]): number => (
    values.reduce((selected, candidateValue) => {
      const candidate = Number(candidateValue ?? 0)
      if (Number.isNaN(candidate)) return candidate
      return Math.abs(candidate) > Math.abs(selected) ? candidate : selected
    }, 0)
  )
  return stageFlightSimInputPatch(FLIGHT_SIM_NEUTRAL_INPUT, {
    pitch: selectLargestMagnitude(inputs.map(input => input.pitch)),
    roll: selectLargestMagnitude(inputs.map(input => input.roll)),
    yaw: selectLargestMagnitude(inputs.map(input => input.yaw)),
    throttleDelta: selectLargestMagnitude(inputs.map(input => input.throttleDelta)),
  })
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  return Boolean(element && (element.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(element.tagName)))
}

export function installFlightSimDesktopInput(
  element: HTMLElement,
  options: Readonly<{
    onInput: (input: FlightSimTickInput) => void
    onCycleCamera?: () => void
    onPause?: (reason: string) => void
    shouldPauseOnPointerRelease?: () => boolean
    shouldRequestPointerLock?: () => boolean
  }>,
): FlightSimInputBinding {
  const pressedCodes = new Set<string>()
  let pointerInput = FLIGHT_SIM_NEUTRAL_INPUT
  let ownedPointerLock = document.pointerLockElement === element
  const currentInput = () => mergeFlightSimInputs([
    flightSimInputFromPressedCodes(pressedCodes),
    pointerInput,
  ])
  const publishKeyboard = () => options.onInput(currentInput())
  const release = (reason?: string) => {
    pressedCodes.clear()
    pointerInput = FLIGHT_SIM_NEUTRAL_INPUT
    options.onInput(FLIGHT_SIM_NEUTRAL_INPUT)
    if (reason) options.onPause?.(reason)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return
    if (isFlightSimCameraCycleCode(event.code)) {
      if (!event.repeat) options.onCycleCamera?.()
      event.preventDefault()
      return
    }
    if (!CONTROL_CODES.has(event.code)) return
    updateFlightSimPressedCode(pressedCodes, event.code, true)
    publishKeyboard()
    event.preventDefault()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (!CONTROL_CODES.has(event.code)) return
    updateFlightSimPressedCode(pressedCodes, event.code, false)
    publishKeyboard()
    event.preventDefault()
  }
  const onMouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement !== element || (!event.movementX && !event.movementY)) return
    pointerInput = mergeFlightSimInputs([
      pointerInput,
      flightSimInputFromPointerDelta(event.movementX, event.movementY),
    ])
    options.onInput(currentInput())
  }
  const onPointerLockChange = () => {
    const ownsPointerLock = document.pointerLockElement === element
    if (ownsPointerLock) {
      ownedPointerLock = true
      element.dataset.kgFlightSimPointerLock = 'locked'
      delete element.dataset.kgFlightSimPointerLockError
      return
    }
    if (!ownedPointerLock) return
    ownedPointerLock = false
    element.dataset.kgFlightSimPointerLock = 'released'
    release(options.shouldPauseOnPointerRelease?.() === false
      ? undefined
      : 'Flight Sim paused when pointer control was released.')
  }
  const requestPointerLock = async () => {
    if (options.shouldRequestPointerLock?.() === false) return
    if (document.pointerLockElement === element) return
    const result = element.requestPointerLock()
    if (result && typeof (result as Promise<void>).then === 'function') await result
  }
  const onCanvasPointerLockRequest = () => void requestPointerLock().catch(error => {
    const detail = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error)
    element.dataset.kgFlightSimPointerLock = 'unavailable'
    element.dataset.kgFlightSimPointerLockError = detail
  })
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') release('Flight Sim paused while the document is hidden.')
  }
  const onBlur = () => release('Flight Sim paused when the window lost focus.')

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onPointerLockChange)
  document.addEventListener('visibilitychange', onVisibilityChange)
  element.addEventListener('click', onCanvasPointerLockRequest)
  window.addEventListener(
    FLIGHT_SIM_POINTER_CAPTURE_REQUEST_EVENT,
    onCanvasPointerLockRequest,
  )

  return Object.freeze({
    consumeInput() {
      const value = currentInput()
      pointerInput = FLIGHT_SIM_NEUTRAL_INPUT
      return value
    },
    requestPointerLock,
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      element.removeEventListener('click', onCanvasPointerLockRequest)
      window.removeEventListener(
        FLIGHT_SIM_POINTER_CAPTURE_REQUEST_EVENT,
        onCanvasPointerLockRequest,
      )
      if (document.pointerLockElement === element) void document.exitPointerLock()
      ownedPointerLock = false
      delete element.dataset.kgFlightSimPointerLock
      delete element.dataset.kgFlightSimPointerLockError
      release()
    },
  })
}
