import { writeKnowledgeGraphSourceShard } from "./store.mjs";

function annotateFragmentRepository(source, fragment, checkpoint) {
  return {
    ...fragment,
    nodes: fragment.nodes.map((node) => {
      checkpoint();
      return {
        ...node,
        properties: {
          ...node.properties,
          "corpus:repositoryId": source.repositoryId,
          "corpus:repositoryPath": source.repositoryPath,
        },
      };
    }),
  };
}

export async function persistKnowledgeGraphSource({
  source,
  fragment,
  reusableEntry,
  pointerPath,
  outputRoot,
  objectTransaction,
  deps,
  budget,
  checkpoint,
}) {
  if (reusableEntry) return { fragment, sourceEntry: reusableEntry };
  const annotated = annotateFragmentRepository(source, fragment, checkpoint);
  const persist = (value) => writeKnowledgeGraphSourceShard(pointerPath, source, value, {
    allowedRoot: outputRoot,
    maxSourceShardBytes: deps.maxSourceShardBytes,
    maxSourcePartTargetBytes: deps.maxSourcePartTargetBytes,
    maxSourceArtifactBytes: deps.maxSourceArtifactBytes,
    maxSourceArtifactRecords: deps.maxSourceArtifactRecords,
    maxSourceParts: deps.maxSourceParts,
    objectTransaction,
    ...budget,
  });
  return { fragment: annotated, sourceEntry: await persist(annotated) };
}
