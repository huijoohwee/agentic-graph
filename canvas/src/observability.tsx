import React from 'react'
import { createRoot } from 'react-dom/client'
import ObservabilityWorkspace from './features/observability-workspace/ObservabilityWorkspace'
import './index.css'

const root = document.getElementById('root')
if (!root) throw Error('Observability root is missing')
createRoot(root).render(<React.StrictMode><ObservabilityWorkspace /></React.StrictMode>)
