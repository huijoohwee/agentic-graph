import React from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import { getRendererPalette } from '@/lib/graph/schema';
import type { JSONValue } from '@/lib/graph/types';
import { useShallow } from 'zustand/react/shallow';

export function useRendererPalette() {
  const { schema, setSchema } = useGraphStore(
    useShallow((s) => ({
      schema: s.schema,
      setSchema: s.setSchema,
    }))
  );

  const palette = React.useMemo(() => getRendererPalette(schema), [schema]);

  const handleUpdatePaletteColor = React.useCallback(
    (kind: 'node' | 'edge', key: string, value: string) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return;
      const current = schema;
      const meta =
        current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
          ? (current.metadata as Record<string, JSONValue>)
          : ({} as Record<string, JSONValue>);
      const existingRaw = Object.prototype.hasOwnProperty.call(meta, 'renderer:palette')
        ? (meta['renderer:palette'] as unknown)
        : undefined;
      const existing =
        existingRaw && typeof existingRaw === 'object' && !Array.isArray(existingRaw)
          ? (existingRaw as { nodes?: Record<string, string>; edges?: Record<string, string> })
          : { nodes: {}, edges: {} };
      const nextNodes: Record<string, string> = { ...(existing.nodes || {}) };
      const nextEdges: Record<string, string> = { ...(existing.edges || {}) };
      if (kind === 'node') {
        nextNodes[key] = trimmed;
      } else {
        nextEdges[key] = trimmed;
      }
      const nextPalette: { nodes?: Record<string, string>; edges?: Record<string, string> } = {
        ...existing,
        nodes: nextNodes,
        edges: nextEdges,
      };
      const nextSchema = {
        ...current,
        metadata: {
          ...meta,
          'renderer:palette': nextPalette as JSONValue,
        },
      };
      setSchema(nextSchema);
    },
    [schema, setSchema]
  );

  return {
    palette,
    handleUpdatePaletteColor,
  };
}
