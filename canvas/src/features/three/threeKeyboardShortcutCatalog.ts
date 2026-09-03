import { buildCameraKeyboardInvocation } from '@/features/strybldr/cameraMcpRuntime'
import { CAMERA_WEB_MCP_TOOL_IDS } from '@/features/strybldr/cameraMcpContract.mjs'
import {
  buildXrAnimationObjectMoveInvocation,
} from '@/features/three/xrAnimationMcpRuntime'
import { XR_ANIMATION_WEB_MCP_TOOL_IDS } from '@/features/three/xrAnimationMcpContract.mjs'
import {
  THREE_CAMERA_KEYBOARD_FINE_ORBIT_STEP,
  THREE_CAMERA_KEYBOARD_ORBIT_STEP,
  THREE_OBJECT_KEYBOARD_FINE_STEP_METERS,
  THREE_OBJECT_KEYBOARD_STEP_METERS,
} from './threeKeyboardChoreography'

export const THREE_KEYBOARD_SHORTCUT_GRAMMAR_SIGILS = ['/', '#', '@'] as const

export const THREE_KEYBOARD_SHORTCUT_CATEGORIES = [
  '3D animation',
  'Camera framing',
  'Camera choreography',
] as const

export type ThreeKeyboardShortcutCategory = typeof THREE_KEYBOARD_SHORTCUT_CATEGORIES[number]

export type ThreeKeyboardShortcut = Readonly<{
  action: string
  category: ThreeKeyboardShortcutCategory
  context: string
  id: string
  input: string
  invocation: string
  mcpInput: Readonly<Record<string, unknown>>
  mcpTool: string
  textKey: string
}>

const cameraControlTool = `agentic-graph.${CAMERA_WEB_MCP_TOOL_IDS.control}`
const animationControlTool = `agentic-graph.${XR_ANIMATION_WEB_MCP_TOOL_IDS.control}`

export function buildThreeKeyboardShortcutCatalog(): readonly ThreeKeyboardShortcut[] {
  return Object.freeze([
    Object.freeze({
      id: 'xr-object-choreography',
      textKey: 'xr.object-choreography',
      category: '3D animation',
      action: 'Move / choreograph selected 3D object',
      input: 'WASD / Arrow keys · Shift for fine movement',
      context: 'XR canvas with a selected cast lane mark',
      invocation: buildXrAnimationObjectMoveInvocation({
        keys: ['w', 'd'],
        distanceMeters: THREE_OBJECT_KEYBOARD_STEP_METERS,
      }),
      mcpTool: animationControlTool,
      mcpInput: Object.freeze({
        operation: 'move-object',
        keys: Object.freeze(['w', 'd']),
        distanceMeters: THREE_OBJECT_KEYBOARD_STEP_METERS,
      }),
    }),
    Object.freeze({
      id: 'xr-camera-framing',
      textKey: 'xr.camera-framing',
      category: 'Camera framing',
      action: 'Orbit shared Camera framing',
      input: 'WASD / Arrow keys · Shift for fine orbit',
      context: 'XR canvas with Camera open and no Camera mark selected',
      invocation: buildCameraKeyboardInvocation({
        action: 'frame',
        keys: ['w', 'd'],
        amount: THREE_CAMERA_KEYBOARD_ORBIT_STEP,
      }),
      mcpTool: cameraControlTool,
      mcpInput: Object.freeze({
        action: 'frame',
        keys: Object.freeze(['w', 'd']),
        amount: THREE_CAMERA_KEYBOARD_ORBIT_STEP,
      }),
    }),
    Object.freeze({
      id: 'xr-camera-choreography',
      textKey: 'xr.camera-choreography',
      category: 'Camera choreography',
      action: 'Move selected Camera timeline mark',
      input: 'WASD / Arrow keys · Shift for fine orbit',
      context: 'XR canvas with Camera open and a Camera lane mark selected',
      invocation: buildCameraKeyboardInvocation({
        action: 'animate',
        fine: true,
        keys: ['ArrowRight'],
      }),
      mcpTool: cameraControlTool,
      mcpInput: Object.freeze({
        action: 'animate',
        fine: true,
        keys: Object.freeze(['ArrowRight']),
      }),
    }),
  ] satisfies readonly ThreeKeyboardShortcut[])
}

export function getThreeKeyboardShortcutSearchText(shortcut: ThreeKeyboardShortcut): string {
  return [
    shortcut.action,
    shortcut.category,
    shortcut.context,
    shortcut.input,
    shortcut.invocation,
    shortcut.mcpTool,
    JSON.stringify(shortcut.mcpInput),
  ].join(' | ')
}

export function formatThreeKeyboardShortcutCopyLine(shortcut: ThreeKeyboardShortcut): string {
  const fineAmount = shortcut.category === '3D animation'
    ? `${THREE_OBJECT_KEYBOARD_FINE_STEP_METERS} m`
    : String(THREE_CAMERA_KEYBOARD_FINE_ORBIT_STEP)
  return [
    `${shortcut.action} — ${shortcut.input}`,
    `fine=${fineAmount}`,
    shortcut.invocation,
    `MCP ${shortcut.mcpTool}`,
  ].filter(Boolean).join(' · ')
}
