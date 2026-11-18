import React from 'react'
import { createRoot } from 'react-dom/client'
import { NativeTitleTooltip } from 'agentic-design-system/react/hover'
import ObservabilityWorkspace from './features/observability-workspace/ObservabilityWorkspace'
import 'agentic-design-system/profile.css'
import './index.css'

const root = document.getElementById('root')
if (!root) throw Error('Observability root is missing')
createRoot(root).render(<React.StrictMode><NativeTitleTooltip fallbackAttribute="data-kg-inline-invocation-markdown" /><ObservabilityWorkspace /></React.StrictMode>)
