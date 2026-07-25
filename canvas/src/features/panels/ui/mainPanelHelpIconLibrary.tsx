import React from 'react'
import {
  Accessibility, ArrowRightLeft, BarChart3, Braces, CalendarClock, Camera, ChartGantt, Clapperboard, Copy, CreditCard, Cuboid, Eraser, GitBranch, Globe2, Hand, Hash,
  HelpCircle, History as HistoryIcon, ImageIcon, LayoutGrid, Link2, ListChecks, LocateFixed, Map as MapIcon, MessageCircle, MonitorPlay,
  Network, Palette, Plane, Plug, PlugZap, Radio, Server, Settings, SlidersHorizontal, SquareCheckBig, SquareTerminal, Table, Type as TextTypeIcon, UserX, Users,
  Workflow,
} from 'lucide-react'
import type { MainPanelTabKey } from '@/features/panels/mainPanelTabs'
import {
  MAIN_PANEL_FIELD_ICON_KEYS,
  MAIN_PANEL_FIELD_ICON_META_BY_KEY,
} from './mainPanelHelpFieldIconLibrary'
import {
  MAIN_PANEL_INVOCATION_SUBJECT_ICON_KEYS,
  MAIN_PANEL_INVOCATION_SUBJECT_ICON_META_BY_KEY,
} from './mainPanelHelpInvocationIconLibrary'
export { resolveMainPanelInvocationSubjectIconKey } from './mainPanelHelpInvocationIconLibrary'

export type MainPanelTypeIconComponent = React.ComponentType<{
  className?: string
  strokeWidth?: number | string
  'aria-hidden'?: boolean | 'true' | 'false'
}>

export const MAIN_PANEL_TYPE_ICON_KEYS = [
  'collaboration.peer',
  'collaboration.session',
  'collaboration.runtime',
  'collaboration.transport',
  'collaboration.follow',
  'collaboration.connection',
  'collaboration.link',
  'collaboration.copy',
  'collaboration.removePeer',
  'setting.text',
  'setting.number',
  'setting.boolean',
  'setting.object',
  'setting.list',
  'setting.dateTime',
  'setting.url',
  'action.clear',
  'ktv.type.static',
  'ktv.type.preset',
  'ktv.type.tiles',
  'ktv.type.style',
  'ktv.type.globe',
  'ktv.type.color',
  'ktv.type.scale',
  'ktv.type.action',
  'ktv.type.toggle',
  'ktv.type.browser',
  'ktv.type.duration',
  'ktv.type.size',
  'mainPanel.collaboration',
  'mainPanel.integrations',
  'mainPanel.mcp',
  'mainPanel.maps',
  'mainPanel.commerce',
  'mainPanel.research',
  'mainPanel.design',
  'mainPanel.workflowManager',
  'mainPanel.dashboard',
  'mainPanel.preview',
  'mainPanel.settings',
  'mainPanel.history',
  'mainPanel.help',
  'floatingPanel.propsPanel',
  'floatingPanel.skillsCommands',
  'floatingPanel.promptPresets',
  'floatingPanel.view',
  'floatingPanel.media',
  'floatingPanel.animation',
  'floatingPanel.motionControl',
  'floatingPanel.gameMode',
  'floatingPanel.flightSim',
  'floatingPanel.camera',
  'floatingPanel.design',
  'floatingPanel.chat',
  'floatingPanel.geo',
  'floatingPanel.renderer',
  'floatingPanel.storyboardWidget',
  'floatingPanel.flowchart',
  'floatingPanel.gitGraph',
  'floatingPanel.gantt',
  'floatingPanel.timeline',
  'floatingPanel.architecture',
  'floatingPanel.eventModeling',
  'floatingPanel.graphTraversal',
  ...MAIN_PANEL_INVOCATION_SUBJECT_ICON_KEYS,
  ...MAIN_PANEL_FIELD_ICON_KEYS,
] as const

export type MainPanelTypeIconKey = (typeof MAIN_PANEL_TYPE_ICON_KEYS)[number]

export type MainPanelTypeIconMeta = Readonly<{
  category: string
  label: string
  Icon: MainPanelTypeIconComponent
}>

export const MAIN_PANEL_TYPE_ICON_META_BY_KEY = {
  'collaboration.peer': {
    category: 'Collaboration type',
    label: 'Peer / roster',
    Icon: Users,
  },
  'collaboration.session': {
    category: 'Collaboration type',
    label: 'Session state',
    Icon: Radio,
  },
  'collaboration.runtime': {
    category: 'Collaboration type',
    label: 'Runtime ready',
    Icon: PlugZap,
  },
  'collaboration.transport': {
    category: 'Collaboration type',
    label: 'Transport pending',
    Icon: Plug,
  },
  'collaboration.follow': {
    category: 'Collaboration type',
    label: 'Follow target',
    Icon: LocateFixed,
  },
  'collaboration.connection': {
    category: 'Collaboration type',
    label: 'Handshake / exchange',
    Icon: ArrowRightLeft,
  },
  'collaboration.link': {
    category: 'Collaboration type',
    label: 'Invite link',
    Icon: Link2,
  },
  'collaboration.copy': {
    category: 'Collaboration type',
    label: 'Copy artifact',
    Icon: Copy,
  },
  'collaboration.removePeer': {
    category: 'Collaboration type',
    label: 'Remove peer',
    Icon: UserX,
  },
  'setting.text': {
    category: 'Setting value type',
    label: 'Text',
    Icon: TextTypeIcon,
  },
  'setting.number': {
    category: 'Setting value type',
    label: 'Number',
    Icon: Hash,
  },
  'setting.boolean': {
    category: 'Setting value type',
    label: 'Boolean',
    Icon: SquareCheckBig,
  },
  'setting.object': {
    category: 'Setting value type',
    label: 'Object / JSON',
    Icon: Braces,
  },
  'setting.list': {
    category: 'Setting value type',
    label: 'List',
    Icon: ListChecks,
  },
  'setting.dateTime': {
    category: 'Setting value type',
    label: 'Date / time',
    Icon: CalendarClock,
  },
  'setting.url': {
    category: 'Setting value type',
    label: 'URL / endpoint',
    Icon: Link2,
  },
  'action.clear': {
    category: 'Action type',
    label: 'Clear / reset',
    Icon: Eraser,
  },
  'ktv.type.static': {
    category: 'KTV row type',
    label: 'Static',
    Icon: LayoutGrid,
  },
  'ktv.type.preset': {
    category: 'KTV row type',
    label: 'Preset',
    Icon: ListChecks,
  },
  'ktv.type.tiles': {
    category: 'KTV row type',
    label: 'Tiles',
    Icon: MapIcon,
  },
  'ktv.type.style': {
    category: 'KTV row type',
    label: 'Style',
    Icon: Palette,
  },
  'ktv.type.globe': {
    category: 'KTV row type',
    label: 'Globe',
    Icon: Globe2,
  },
  'ktv.type.color': {
    category: 'KTV row type',
    label: 'Color',
    Icon: Palette,
  },
  'ktv.type.scale': {
    category: 'KTV row type',
    label: 'Scale',
    Icon: SlidersHorizontal,
  },
  'ktv.type.action': {
    category: 'KTV row type',
    label: 'Action',
    Icon: Hand,
  },
  'ktv.type.toggle': {
    category: 'KTV row type',
    label: 'Toggle',
    Icon: SquareCheckBig,
  },
  'ktv.type.browser': {
    category: 'KTV row type',
    label: 'Browser',
    Icon: Link2,
  },
  'ktv.type.duration': {
    category: 'KTV row type',
    label: 'Duration',
    Icon: CalendarClock,
  },
  'ktv.type.size': {
    category: 'KTV row type',
    label: 'Size',
    Icon: Hash,
  },
  'mainPanel.collaboration': {
    category: 'MainPanel surface',
    label: 'Collaboration',
    Icon: Users,
  },
  'mainPanel.integrations': {
    category: 'MainPanel surface',
    label: 'Integrations',
    Icon: Plug,
  },
  'mainPanel.mcp': {
    category: 'MainPanel surface',
    label: 'MCP',
    Icon: Server,
  },
  'mainPanel.maps': {
    category: 'MainPanel surface',
    label: 'Maps',
    Icon: MapIcon,
  },
  'mainPanel.commerce': {
    category: 'MainPanel surface',
    label: 'Commerce',
    Icon: CreditCard,
  },
  'mainPanel.research': { category: 'MainPanel surface', label: 'Research', Icon: BarChart3 },
  'mainPanel.design': {
    category: 'MainPanel surface',
    label: 'Design',
    Icon: Palette,
  },
  'mainPanel.workflowManager': {
    category: 'MainPanel surface',
    label: 'Workflow Manager',
    Icon: Table,
  },
  'mainPanel.dashboard': {
    category: 'MainPanel surface',
    label: 'Dashboard',
    Icon: BarChart3,
  },
  'mainPanel.preview': {
    category: 'MainPanel surface',
    label: 'Preview Panel',
    Icon: MonitorPlay,
  },
  'mainPanel.settings': {
    category: 'MainPanel surface',
    label: 'Settings',
    Icon: Settings,
  },
  'mainPanel.history': {
    category: 'MainPanel surface',
    label: 'History',
    Icon: HistoryIcon,
  },
  'mainPanel.help': {
    category: 'MainPanel surface',
    label: 'Help',
    Icon: HelpCircle,
  },
  'floatingPanel.propsPanel': {
    category: 'FloatingPanel surface',
    label: 'Props Panel',
    Icon: SlidersHorizontal,
  },
  'floatingPanel.skillsCommands': {
    category: 'FloatingPanel surface',
    label: 'Skills & Commands',
    Icon: SquareTerminal,
  },
  'floatingPanel.promptPresets': {
    category: 'FloatingPanel surface',
    label: 'Prompt Presets',
    Icon: ListChecks,
  },
  'floatingPanel.view': {
    category: 'FloatingPanel surface',
    label: 'View',
    Icon: LayoutGrid,
  },
  'floatingPanel.media': {
    category: 'FloatingPanel surface',
    label: 'Media',
    Icon: ImageIcon,
  },
  'floatingPanel.animation': {
    category: 'FloatingPanel surface',
    label: 'Animation',
    Icon: Clapperboard,
  },
  'floatingPanel.motionControl': {
    category: 'FloatingPanel surface',
    label: 'Motion Control',
    Icon: Accessibility,
  },
  'floatingPanel.gameMode': {
    category: 'FloatingPanel surface',
    label: 'Game Mode',
    Icon: Cuboid,
  },
  'floatingPanel.flightSim': {
    category: 'FloatingPanel surface',
    label: 'Flight Sim',
    Icon: Plane,
  },
  'floatingPanel.camera': {
    category: 'FloatingPanel surface',
    label: 'Camera',
    Icon: Camera,
  },
  'floatingPanel.design': {
    category: 'FloatingPanel surface',
    label: 'Design',
    Icon: Palette,
  },
  'floatingPanel.chat': {
    category: 'FloatingPanel surface',
    label: 'Chat',
    Icon: MessageCircle,
  },
  'floatingPanel.geo': {
    category: 'FloatingPanel surface',
    label: 'Geo',
    Icon: MapIcon,
  },
  'floatingPanel.renderer': {
    category: 'FloatingPanel surface',
    label: 'Renderer',
    Icon: MonitorPlay,
  },
  'floatingPanel.storyboardWidget': {
    category: 'FloatingPanel surface',
    label: 'Storyboard Widget',
    Icon: Braces,
  },
  'floatingPanel.flowchart': {
    category: 'FloatingPanel surface',
    label: 'Flowchart',
    Icon: LayoutGrid,
  },
  'floatingPanel.gitGraph': { category: 'FloatingPanel surface', label: 'GitGraph', Icon: GitBranch },
  'floatingPanel.gantt': { category: 'FloatingPanel surface', label: 'Gantt', Icon: ChartGantt },
  'floatingPanel.timeline': { category: 'FloatingPanel surface', label: 'Timeline', Icon: HistoryIcon },
  'floatingPanel.architecture': { category: 'FloatingPanel surface', label: 'Architecture', Icon: Network },
  'floatingPanel.eventModeling': { category: 'FloatingPanel surface', label: 'Event Model', Icon: Workflow },
  'floatingPanel.graphTraversal': {
    category: 'FloatingPanel surface',
    label: 'Graph Traversal',
    Icon: GitBranch,
  },
  ...MAIN_PANEL_INVOCATION_SUBJECT_ICON_META_BY_KEY,
  ...MAIN_PANEL_FIELD_ICON_META_BY_KEY,
} satisfies Record<MainPanelTypeIconKey, MainPanelTypeIconMeta>

export const MAIN_PANEL_TAB_TYPE_ICON_KEY_BY_TAB = {
  collaboration: 'mainPanel.collaboration',
  integrations: 'mainPanel.integrations',
  mcp: 'mainPanel.mcp',
  maps: 'mainPanel.maps',
  commerce: 'mainPanel.commerce',
  research: 'mainPanel.research',
  design: 'mainPanel.design',
  workflowManager: 'mainPanel.workflowManager',
  dashboard: 'mainPanel.dashboard',
  preview: 'mainPanel.preview',
  settings: 'mainPanel.settings',
  history: 'mainPanel.history',
  help: 'mainPanel.help',
} satisfies Record<MainPanelTabKey, MainPanelTypeIconKey>

export const getMainPanelTypeIconComponent = (iconKey: MainPanelTypeIconKey): MainPanelTypeIconComponent => (
  MAIN_PANEL_TYPE_ICON_META_BY_KEY[iconKey].Icon
)

export const MAIN_PANEL_TAB_TYPE_ICON_BY_KEY = Object.fromEntries(
  Object.entries(MAIN_PANEL_TAB_TYPE_ICON_KEY_BY_TAB).map(([tabKey, iconKey]) => [
    tabKey,
    getMainPanelTypeIconComponent(iconKey),
  ]),
) as Record<MainPanelTabKey, MainPanelTypeIconComponent>

export type FloatingPanelTypeIconView =
  | 'propsPanel'
  | 'skillsCommands'
  | 'promptPresets'
  | 'view'
  | 'media'
  | 'animation'
  | 'motionControl'
  | 'gameMode'
  | 'flightSim'
  | 'cityBuilder'
  | 'camera'
  | 'design'
  | 'chat'
  | 'geo'
  | 'renderer'
  | 'storyboardWidget'
  | 'flowchart'
  | 'gitGraph'
  | 'gantt'
  | 'timeline'
  | 'architecture'
  | 'eventModeling'
  | 'graphTraversal'

export const FLOATING_PANEL_TYPE_ICON_KEY_BY_VIEW = {
  propsPanel: 'floatingPanel.propsPanel',
  skillsCommands: 'floatingPanel.skillsCommands',
  promptPresets: 'floatingPanel.promptPresets',
  view: 'floatingPanel.view',
  media: 'floatingPanel.media',
  animation: 'floatingPanel.animation',
  motionControl: 'floatingPanel.motionControl',
  gameMode: 'floatingPanel.gameMode',
  flightSim: 'floatingPanel.flightSim',
  cityBuilder: 'floatingPanel.gameMode',
  camera: 'floatingPanel.camera',
  design: 'floatingPanel.design',
  chat: 'floatingPanel.chat',
  geo: 'floatingPanel.geo',
  renderer: 'floatingPanel.renderer',
  storyboardWidget: 'floatingPanel.storyboardWidget',
  flowchart: 'floatingPanel.flowchart',
  gitGraph: 'floatingPanel.gitGraph',
  gantt: 'floatingPanel.gantt',
  timeline: 'floatingPanel.timeline',
  architecture: 'floatingPanel.architecture',
  eventModeling: 'floatingPanel.eventModeling',
  graphTraversal: 'floatingPanel.graphTraversal',
} satisfies Record<FloatingPanelTypeIconView, MainPanelTypeIconKey>

export const FLOATING_PANEL_TYPE_ICON_BY_VIEW = Object.fromEntries(
  Object.entries(FLOATING_PANEL_TYPE_ICON_KEY_BY_VIEW).map(([view, iconKey]) => [
    view,
    getMainPanelTypeIconComponent(iconKey),
  ]),
) as Record<FloatingPanelTypeIconView, MainPanelTypeIconComponent>

export function getMainPanelTypeIconMeta(iconKey: MainPanelTypeIconKey): MainPanelTypeIconMeta {
  return MAIN_PANEL_TYPE_ICON_META_BY_KEY[iconKey]
}

export function resolveMainPanelSettingTypeIconKey(typeLabel: string): MainPanelTypeIconKey {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (!normalized) return 'setting.text'
  if (
    normalized.includes('url')
    || normalized.includes('uri')
    || normalized.includes('endpoint')
    || normalized.includes('route')
    || normalized.includes('link')
  ) {
    return 'setting.url'
  }
  if (
    normalized.includes('date')
    || normalized.includes('time')
    || normalized.includes('ttl')
    || normalized.includes('expiry')
    || normalized.includes('schedule')
  ) {
    return 'setting.dateTime'
  }
  if (
    normalized.includes('array')
    || normalized.includes('[]')
    || normalized.includes('list')
    || normalized.includes('multi-select')
    || normalized.includes('collection')
  ) {
    return 'setting.list'
  }
  if (
    normalized.includes('object')
    || normalized.includes('json')
    || normalized.includes('body')
    || normalized.includes('payload')
    || normalized.includes('config')
  ) {
    return 'setting.object'
  }
  if (
    normalized.includes('bool')
    || normalized.includes('checkbox')
    || normalized.includes('toggle')
    || normalized.includes('flag')
  ) {
    return 'setting.boolean'
  }
  if (
    normalized.includes('number')
    || normalized.includes('int')
    || normalized.includes('integer')
    || normalized.includes('float')
    || normalized.includes('decimal')
    || normalized.includes('currency')
    || normalized.includes('ratio')
    || normalized.includes('duration')
    || normalized.includes('limit')
  ) {
    return 'setting.number'
  }
  return 'setting.text'
}

export function resolveMainPanelKtvTypeIconKey(typeLabel: string): MainPanelTypeIconKey {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (!normalized) return 'setting.text'
  if (normalized === 'static') return 'ktv.type.static'
  if (normalized === 'preset') return 'ktv.type.preset'
  if (normalized === 'tiles' || normalized === 'tile') return 'ktv.type.tiles'
  if (normalized === 'style' || normalized === 'default' || normalized === 'custom') return 'ktv.type.style'
  if (normalized === 'globe') return 'ktv.type.globe'
  if (normalized === 'color' || normalized === 'colour') return 'ktv.type.color'
  if (normalized === 'scale' || normalized.includes('radius') || normalized.includes('multiplier')) return 'ktv.type.scale'
  if (normalized === 'action' || normalized === 'command') return 'ktv.type.action'
  if (normalized === 'toggle' || normalized === 'switch') return 'ktv.type.toggle'
  if (normalized === 'browser' || normalized.includes('location')) return 'ktv.type.browser'
  if (normalized === 'ms' || normalized.includes('timeout') || normalized.includes('duration')) return 'ktv.type.duration'
  if (normalized === 'mb' || normalized.includes('byte') || normalized.includes('size')) return 'ktv.type.size'
  return resolveMainPanelSettingTypeIconKey(normalized)
}

export function MainPanelTypeIcon({
  iconKey,
  className,
  strokeWidth,
  ariaHidden = true,
}: {
  iconKey: MainPanelTypeIconKey
  className?: string
  strokeWidth?: number | string
  ariaHidden?: boolean | 'true' | 'false'
}) {
  const Icon = MAIN_PANEL_TYPE_ICON_META_BY_KEY[iconKey].Icon
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden={ariaHidden} />
}
