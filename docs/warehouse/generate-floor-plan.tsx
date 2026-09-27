/** Run from repository root: node --import tsx docs/warehouse/generate-floor-plan.tsx */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { WarehousePlanDrawing } from '../../canvas/src/features/python-learning/WarehousePlanDrawing'
import { learningLesson } from '../../canvas/src/features/python-learning/learningLessons'
const lesson = learningLesson('drone')
const drawing = <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="-64 -32 128 80" role="img" aria-labelledby="title description">
  <title id="title">Warehouse concept — logistics allocation and drone inspection cell</title>
  <desc id="description">Assumed 60 by 40 metre indoor warehouse with 80 percent logistics and 20 percent ancillary. West inbound and east outbound container bays, dock levelers and 12 metre maneuvering aisles. A 16 by 16 metre bounded simulation cell contains the nine-second inspection route. Not an approved building plan.</desc>
  <rect x="-64" y="-32" width="128" height="80" fill="#f8faf9" />
  <g fontFamily="system-ui, sans-serif" fill="#273e4c"><text x="-60" y="-28.7" fontSize="1.8" fontWeight="700">WAREHOUSE / FLIGHT INSPECTION CONCEPT</text><text x="-60" y="-26.6" fontSize="1">B2 ramp-up brief · assumed dimensions · north ↑ · metres</text></g>
  <WarehousePlanDrawing />
  <rect x="-8" y="-8" width="16" height="16" fill="#e9f5ff" fillOpacity=".7" stroke="#277bc3" strokeWidth=".2" strokeDasharray=".5 .3" />
  <g fontFamily="system-ui, sans-serif" fill="#204767"><text x="-7.5" y="-6.8" fontSize=".7">16 × 16 m inspection cell</text><text x="-7.5" y="-5.7" fontSize=".65">Altitude 0–4 m · simulation only</text></g>
  {lesson.obstacles.map(obstacle => <g key={obstacle.id}><rect x={obstacle.position[0] - obstacle.size[0] / 2} y={obstacle.position[1] - obstacle.size[1] / 2} width={obstacle.size[0]} height={obstacle.size[1]} fill={obstacle.id.startsWith('rack-') ? '#dd9553' : '#b99d74'} stroke="#326481" strokeWidth=".12" /><text x={obstacle.position[0]} y={obstacle.position[1] + .15} textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize=".52" fill="#273e4c">{obstacle.name}</text></g>)}
  <path d="M 0 0 H 4" stroke="#287fd1" strokeWidth=".18" strokeDasharray=".3 .1" />
  <circle r=".5" fill="#287fd1" /><circle cx="4" r=".5" fill="#399775" />
  <g fontFamily="system-ui, sans-serif" fill="#273e4c" fontSize="1.05">
    <text x="-60" y="35">FLOW: receive → security → store → kit → pack → dispatch</text>
    <text x="-60" y="37.5">CORE 1,920 m² (80%) · ANCILLARY 480 m² (20%) · TOTAL 2,400 m²</text>
    <text x="-60" y="40">Break / pantry is staff support, not residential accommodation. Exterior aprons are outside this indoor allocation.</text>
    <text x="-60" y="42.5">Concept meets the requested 60:40 planning ratio. Surveyed GFA, vehicle swept paths, ramps and approvals remain unverified.</text>
    <text x="-60" y="45">Drone: take off 2 m → hover 1 s → fly 4 m at 1 m/s → land. No motors; no autonomous navigation.</text>
  </g>
</svg>
writeFileSync(new URL('./warehouse-floor-plan.svg', import.meta.url), '<?xml version="1.0" encoding="UTF-8"?>\n' + renderToStaticMarkup(drawing) + '\n')
