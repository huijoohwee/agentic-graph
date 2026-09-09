---
title: Production browser compatibility checks
status: active
doc_type: Release Evidence
---

# Production browser compatibility checks

The DETR adapter declares the single pipeline factory contract it consumes before
calling the Transformers generic API. This avoids TypeScript materializing the
union of all supported pipelines; runtime behavior and model selection are
unchanged. The dependency candidate verifies it against the selected release.

The Singapore projection test now reads the number of authored surfaces from
its existing authoritative profile. Its old literal nine also failed with the
previous dependencies: the current profile contains twelve surfaces, including
separate landmark parts. The independent anchor, footprint, dimensions and
MapLibre layer assertions remain in place.

The complete dependency candidate must run Canvas typecheck, the geospatial
behavior suite and the browser checks. The comprehensive XR verifier requires
a clean published source commit and an exact upstream observation; a local
unpublished branch cannot supply that release evidence.
