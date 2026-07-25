const PUBLIC_ERRORS = Object.freeze({
  INVALID_ARGUMENTS: "Repository pack arguments did not pass the closed contract.",
  INVALID_HOST_BOUNDS: "Repository packing host bounds exceed the runtime contract.",
  NOT_GIT_WORKTREE: "The requested repository is not a readable exact Git worktree.",
  ROOT_SCOPE_MISMATCH: "The requested repository does not match its canonical Git worktree root.",
  GIT_INVENTORY_FAILED: "Git could not produce a bounded repository inventory.",
  INVENTORY_LIMIT_EXCEEDED: "The selected repository inventory exceeds the configured file bound.",
  FILE_LIMIT_EXCEEDED: "A selected repository file exceeds the configured per-file byte bound.",
  SOURCE_TOTAL_LIMIT_EXCEEDED: "Embedded repository content exceeds the aggregate byte bound.",
  OUTPUT_LIMIT_EXCEEDED: "The packed artifact exceeds the host output byte bound.",
  RUNTIME_LIMIT_EXCEEDED: "Repository packing exceeded the host runtime bound.",
  SENSITIVE_CONTENT: "A selected path or file contains high-confidence sensitive material.",
  SOURCE_CHANGED: "Repository content changed while the pack was being constructed.",
  SOURCE_PATH_UNSAFE: "Git reported an unsafe or escaping repository path.",
  OUTPUT_PATH_UNSAFE: "The repository pack output path failed containment or symlink checks.",
  OUTPUT_COLLISION: "An existing content-addressed output did not match the expected artifact.",
  PACK_ABORTED: "Repository packing was cancelled before publication.",
  PACK_FAILED: "Repository packing failed without publishing an artifact.",
});

export class RepositoryPackError extends Error {
  constructor(code) {
    super(PUBLIC_ERRORS[code] || PUBLIC_ERRORS.PACK_FAILED);
    this.name = "RepositoryPackError";
    this.code = PUBLIC_ERRORS[code] ? code : "PACK_FAILED";
  }
}
