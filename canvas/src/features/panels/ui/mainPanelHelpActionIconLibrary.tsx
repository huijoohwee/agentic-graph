import { Check, CircleCheck, CircleX, Download, FileDown, Link, LogIn, Play, RotateCcw, Save, Unplug, X } from 'lucide-react'

// Actions are registered in the Help icon library, alongside type and tab icons.
export const MAIN_PANEL_ACTION_ICON_META_BY_KEY = {
  'action.run': { category: 'Action', label: 'Run', Icon: Play },
  'action.connect': { category: 'Action', label: 'Connect', Icon: LogIn },
  'action.disconnect': { category: 'Action', label: 'Disconnect', Icon: Unplug },
  'action.save': { category: 'Action', label: 'Save snapshot', Icon: Save },
  'action.restore': { category: 'Action', label: 'Restore', Icon: RotateCcw },
  'action.export': { category: 'Action', label: 'Export', Icon: FileDown },
  'action.import': { category: 'Action', label: 'Import selected', Icon: Download },
  'action.cancel': { category: 'Action', label: 'Cancel', Icon: X },
  'action.discover': { category: 'Action', label: 'Find links', Icon: Link },
  'action.review': { category: 'Action', label: 'Stage review', Icon: Check },
  'status.ready': { category: 'Status', label: 'Ready', Icon: CircleCheck },
  'status.error': { category: 'Status', label: 'Error', Icon: CircleX },
} as const
export const MAIN_PANEL_ACTION_ICON_KEYS = Object.keys(MAIN_PANEL_ACTION_ICON_META_BY_KEY) as Array<keyof typeof MAIN_PANEL_ACTION_ICON_META_BY_KEY>
