import {
  controlLocalFlightSim,
  inspectLocalFlightSim,
  type FlightSimControlExecutionFence,
} from '@/features/game-flight-sim/flightSimMcpRuntime'
import { KNOWGRPH_AGENT_READY_TOOL_IDS } from './knowgrphAgentReadyToolContract.mjs'

type FlightSimWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  securitySchemes?: Array<Record<string, unknown>>
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}>

type FlightSimWebMcpTool = FlightSimWebMcpContract & Readonly<{
  name: string
  execute: (input?: Record<string, unknown>) => Promise<unknown>
}>

type FlightSimDeadline = Readonly<{
  expired: Promise<void>
  cancel: () => void
}>

export type FlightSimWebMcpDependencies = Readonly<{
  inspect?: (fence: FlightSimControlExecutionFence) => unknown | Promise<unknown>
  control?: (
    input: Record<string, unknown>,
    fence: FlightSimControlExecutionFence,
  ) => unknown | Promise<unknown>
  createDeadline?: (deadlineMs: number) => FlightSimDeadline
}>

export const FLIGHT_SIM_WEB_MCP_DEADLINE_MS = 2_000

const FLIGHT_SIM_WEB_MCP_TIMEOUT = Symbol('flight-sim-web-mcp-timeout')

const createFlightSimDeadline = (deadlineMs: number): FlightSimDeadline => {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    expired: new Promise(resolve => {
      timer = setTimeout(resolve, deadlineMs)
    }),
    cancel: () => {
      if (timer !== undefined) clearTimeout(timer)
    },
  }
}

const webMcpError = (
  errorCode: string,
  message: string,
  detail: Readonly<Record<string, unknown>> = {},
) => Object.freeze({ ok: false, errorCode, message, ...detail })

type FlightSimExecutionFence = FlightSimControlExecutionFence & Readonly<{
  invalidate: (reason: Error) => void
}>

function createFlightSimExecutionFenceOwner(): Readonly<{
  begin: () => FlightSimExecutionFence
}> {
  let generation = 0
  let activeController: AbortController | null = null
  return {
    begin: () => {
      activeController?.abort(new Error('Flight Sim WebMCP operation was superseded.'))
      const controller = new AbortController()
      activeController = controller
      generation += 1
      const executionGeneration = generation
      return Object.freeze({
        signal: controller.signal,
        generation: executionGeneration,
        isCurrent: () => (
          activeController === controller
          && generation === executionGeneration
          && !controller.signal.aborted
        ),
        invalidate: (reason: Error) => {
          if (activeController === controller) activeController = null
          if (!controller.signal.aborted) controller.abort(reason)
        },
      })
    },
  }
}

async function executeWithinFlightSimDeadline(
  operationName: 'inspect' | 'control',
  execute: (fence: FlightSimControlExecutionFence) => unknown | Promise<unknown>,
  deadlineFactory: (deadlineMs: number) => FlightSimDeadline,
  fenceOwner: ReturnType<typeof createFlightSimExecutionFenceOwner>,
): Promise<unknown> {
  const deadline = deadlineFactory(FLIGHT_SIM_WEB_MCP_DEADLINE_MS)
  const fence = fenceOwner.begin()
  const timeout = deadline.expired.then(() => {
    fence.invalidate(new Error(
      `Flight Sim ${operationName} exceeded its WebMCP deadline.`,
    ))
    return FLIGHT_SIM_WEB_MCP_TIMEOUT
  })
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => execute(fence)),
      timeout,
    ])
    if (result === FLIGHT_SIM_WEB_MCP_TIMEOUT) {
      return webMcpError(
        'FLIGHT_SIM_WEB_MCP_TIMEOUT',
        `Flight Sim ${operationName} did not complete within ${FLIGHT_SIM_WEB_MCP_DEADLINE_MS} milliseconds.`,
        { operation: operationName, deadlineMs: FLIGHT_SIM_WEB_MCP_DEADLINE_MS },
      )
    }
    return result
  } catch (error) {
    return webMcpError(
      'FLIGHT_SIM_WEB_MCP_EXECUTION_FAILED',
      `Flight Sim ${operationName} failed: ${error instanceof Error ? error.message : String(error)}`,
      { operation: operationName },
    )
  } finally {
    deadline.cancel()
    fence.invalidate(new Error(`Flight Sim ${operationName} execution settled.`))
  }
}

const buildTool = (
  contract: FlightSimWebMcpContract,
  execute: FlightSimWebMcpTool['execute'],
): FlightSimWebMcpTool => ({ ...contract, name: contract.webName, execute })

export function buildFlightSimWebMcpToolBuilders(
  findContract: (name: string) => FlightSimWebMcpContract,
  dependencies: FlightSimWebMcpDependencies = {},
): Record<string, () => FlightSimWebMcpTool> {
  const inspectContract = findContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalFlightSim)
  const controlContract = findContract(KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalFlightSim)
  const inspect = dependencies.inspect || (() => inspectLocalFlightSim())
  const control = dependencies.control || ((
    input: Record<string, unknown>,
    fence: FlightSimControlExecutionFence,
  ) => controlLocalFlightSim(input, fence))
  const deadlineFactory = dependencies.createDeadline || createFlightSimDeadline
  const inspectFenceOwner = createFlightSimExecutionFenceOwner()
  const controlFenceOwner = createFlightSimExecutionFenceOwner()
  return {
    [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalFlightSim]: () => (
      buildTool(inspectContract, async () => executeWithinFlightSimDeadline(
        'inspect',
        async fence => {
          const inspection = await inspect(fence)
          const active = (
            inspection
            && typeof inspection === 'object'
            && 'flightSim' in inspection
            && (inspection as { flightSim?: { active?: unknown } }).flightSim?.active === true
          )
          return active
            ? inspection
            : webMcpError(
              'FLIGHT_SIM_STATE_UNAVAILABLE',
              'Flight Sim state is unavailable while the surface is inactive.',
              { operation: 'inspect' },
            )
        },
        deadlineFactory,
        inspectFenceOwner,
      ))
    ),
    [KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalFlightSim]: () => (
      buildTool(controlContract, async input => executeWithinFlightSimDeadline(
        'control',
        fence => control(input || {}, fence),
        deadlineFactory,
        controlFenceOwner,
      ))
    ),
  }
}
