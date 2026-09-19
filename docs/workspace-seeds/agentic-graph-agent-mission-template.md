---
schema: agentic-graph/dashboard-template/v1
title: Agent Mission dashboard
template_id: agent-mission
template_version: '1.0.0'
dashboard:
  version: 1
  widgets:
    graph:run-status: {template: metric, title: State, tone: blue, aspectRatio: '16:9'}
    graph:run-spans: {template: metric, title: Retained spans, tone: green, aspectRatio: '16:9'}
    graph:run-resources: {template: table, title: Resources, tone: blue, aspectRatio: '16:9'}
    graph:run-span-table: {template: table, title: Observed spans, tone: slate, aspectRatio: '16:9'}
  boards:
    mission-report:
      - [graph:run-status, graph:run-spans]
      - [graph:run-resources, graph:run-span-table]
bindings:
  graph:run-status: {value: run.status}
  graph:run-spans: {value: run.spanCount}
  graph:run-resources:
    rows: resources
    columns:
      - {label: Metric, path: label}
      - {label: Value, path: value}
  graph:run-span-table:
    rows: spans
    columns:
      - {label: Span, path: operation}
      - {label: State, path: status}
      - {label: Time ms, path: durationMs}
      - {label: CPU ms, path: cpuMs}
      - {label: Peak RSS bytes, path: peakMemoryBytes}
---

# Agent Mission {{run.id}}

This historical report contains retained observations. It grants no execution or release authority.
Unknown measurements remain unknown; reused work retains its source status.
