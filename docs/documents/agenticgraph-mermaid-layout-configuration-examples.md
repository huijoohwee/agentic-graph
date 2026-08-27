# AgenticGraph Mermaid Layout Configuration Examples

This document contains configuration examples referenced by `agenticgraph-mermaid-layout-configuration.md`.

---

## High-Fidelity Mermaid Layout

```json
{
  "layout": {
    "mode": "mermaid",
    "mermaid": {
      "orientation": "vertical",
      "direction": "source-target",
      "separation": 3.5,
      "validateTopology": true,
      "enableCaching": true
    },
    "fitPadding": 100,
    "fitTargetAspectRatio": 1.777,
    "fitEnforceAspectRatio": true
  }
}
```

## Horizontal Flow with Custom Spacing

```json
{
  "layout": {
    "mode": "mermaid",
    "mermaid": {
      "orientation": "horizontal",
      "direction": "source-target",
      "separation": 4.0
    }
  }
}
```

## Z-Order Control

```json
{
  "layout": {
    "mode": "mermaid",
    "mermaid": {
      "renderOrder": {
        "MermaidSubgraph": -10,
        "MermaidNode": 0,
        "MermaidEdge": 5,
        "Label": 10
      }
    }
  }
}
```

