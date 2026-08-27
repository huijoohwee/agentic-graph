# AgenticGraph MainPanel Help Dev

Editable MainPanel Help dev Values used by KTV rows.

Keep `Key` aligned to the Help dev text key in source. Keep `Type` aligned to the shared MainPanel Help Icon Library. Keep `Value` concise for the MainPanel Help KTV row. Put longer explanatory copy in semicolon-separated `Details`.

| Key | Type | Value | Details |
| --- | --- | --- | --- |
| dev.lsKeyMappings | ktv.type.static | LS diagnostics | Dev-only local-storage key mapping diagnostics.; Orchestrator section markdown and render diagnostics are internal debug references. |
| dev.uiIconScalePreview | mainPanel.settings | Icon scale preview | Dev: uiIconScale preview.; Current uiIconScale is shown beside the UI Density settings shortcut. |
| semantic.layerDerivation | ktv.type.static | Semantic derivation | Semantic layer derivation (cosine / PMI, top-K, clusters).; Semantic layer mode builds a weighted similarity graph from tokenized node text using either cosine similarity or pointwise mutual information (PMI). Tokens are lower-cased, filtered by length and stopwords, and counted per node; these counts form vectors with Euclidean norms.; The implementation constructs an inverted index from token to node/count pairs, accumulates dot products and shared token counts for node pairs, and computes similarity scores: cosine divides the dot product by the product of norms, while PMI applies log2(p_ij / (p_i * p_j)) and clamps negative values.; For each node, neighbor candidates are sorted by similarity; up to top-K neighbors above the global similarity threshold are kept, and undirected pairs are stored symmetrically. Derived edges receive similarity-based weights and co-occurrence-based widths so renderers can map weight to thickness and count to width.; A NetworkX connected-components pass assigns clusters over this similarity graph. Node importance is derived from token counts or incident similarity weights, mapped into a clamped radius band, and stored as visual:importance and visual:nodeSize alongside visual:community and a deterministic cluster color. |
