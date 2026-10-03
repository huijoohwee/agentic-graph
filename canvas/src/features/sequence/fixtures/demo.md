---
title: Order payment sequence rehearsal
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "sequenceMermaid"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
kgBottomPanelOpen: true
kgBottomPanelTab: "timeline"
kgFloatingPanelOpen: true
kgFloatingPanelView: "sequence"
mermaidTheme: "redux-color"
---

# Order payment sequence rehearsal

Four participants, eight authored messages, two activations, and alternative payment outcomes. Playback defaults to the approved outcome; choose the declined outcome to rehearse its six steps. Each message lasts one rehearsal second. This document executes no payment or network request.

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Shop as Web Shop
    participant Pay as Payment Service
    participant Bank

    Customer->>Shop: Place order
    activate Shop
    Shop->>Pay: Create payment request
    activate Pay
    Pay->>Bank: Authorize card
    Bank-->>Pay: Authorization result
    alt Payment approved
        Pay-->>Shop: Payment confirmed
        Shop-->>Customer: Show receipt
    else Payment declined
        Pay-->>Shop: Payment failed
        Shop-->>Customer: Ask for another card
    end
    deactivate Pay
    deactivate Shop
```

## Review

Open this local document. Compare Sequence Diagram and Sequence Diagram (Mermaid), select either outcome, and use the shared Timeline to play, pause, seek, step, and reset. Source order and event identity stay the same across the canvas and inspector.
