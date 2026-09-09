---
title: Production dependency security update
status: active
doc_type: Release Evidence
---

# Production dependency security update

The September 2026 audit requires Hono 4.13.7, js-yaml 4.3.2, Sharp 0.35.4,
Vitest 4.1.11 and MapLibre 6.4.1. Both map consumers use the same exact version;
Vite resolves the shipped source through exported package metadata and preserves
one shared runtime. The lockfile records the selected registry artifacts.

Transformers 4.2.0 imports ONNX Runtime Node 1.24.3, which installs adm-zip.
GHSA-vwc7-r8mq-g2x9 has no patched adm-zip release. This candidate selects official
Transformers 3.8.1, whose native backend uses tar instead of adm-zip, and removes
the obsolete adm-zip override. Graph uses the stable depth-estimation and DETR
pipeline APIs. ONNX Runtime Web stays pinned to the existing 1.26 development
artifact so the already-hashed local XR Wasm assets retain their exact ABI.
The Web runtime has its own lazy chunk; pipeline code remains separately lazy.
This is a compatibility change requiring real browser regression verification.

The audit threshold is unchanged. No advisory is excluded and no unpublished
archive-library fork is substituted. Reproduction uses the committed lockfile
with npm ci. Required validation includes the full affected integration gate,
package integrity, both audits, Pages/chunk checks, geospatial behavior and XR
browser/model execution. Source integration remains separate from deployment.
