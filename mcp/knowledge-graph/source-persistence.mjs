import { KnowledgeGraphError } from "./contract.mjs";
import { sourceArtifactLimitFragmentForSource } from "./parsers.mjs";
import { writeKnowledgeGraphSourceShard } from "./store.mjs";

function isSerializedSourceArtifactLimit(error) {
  return error instanceof KnowledgeGraphError
    && error.code === "artifact_too_large"
    && Number.isSafeInteger(error.details?.actualBytes)
    && Number.isSafeInteger(error.details?.maxBytes)
    && error.details.actualBytes > error.details.maxBytes;
}

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
  strict,
  pointerPath,
  outputRoot,
  objectTransaction,
  deps,
  budget,
  checkpoint,
}) {
  if (reusableEntry) return { fragment, sourceEntry: reusableEntry };
  let annotated = annotateFragmentRepository(source, fragment, checkpoint);
  const persist = (value) => writeKnowledgeGraphSourceShard(pointerPath, source, value, {
    allowedRoot: outputRoot,
    maxSourceShardBytes: deps.maxSourceShardBytes,
    objectTransaction,
    ...budget,
  });
  try {
    return { fragment: annotated, sourceEntry: await persist(annotated) };
  } catch (error) {
    if (strict || !isSerializedSourceArtifactLimit(error)) throw error;
    annotated = annotateFragmentRepository(
      source,
      sourceArtifactLimitFragmentForSource(source, deps),
      checkpoint,
    );
    return { fragment: annotated, sourceEntry: await persist(annotated) };
  }
}
