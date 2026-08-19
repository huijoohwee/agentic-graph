FROM ollama/ollama@sha256:0ab10b9b9dc5f50d30dc61aec25e3316822ca22cf0f27d4e98d74cc7dedd7c80

ARG OLLAMA_MODEL_REF
ARG OLLAMA_MODEL_MANIFEST_SHA256
ENV OLLAMA_HOST=0.0.0.0:11434

RUN set -eu; \
    test -n "$OLLAMA_MODEL_REF"; \
    echo "$OLLAMA_MODEL_REF" | grep -Eq '^[a-z0-9][a-z0-9._-]*:[A-Za-z0-9][A-Za-z0-9._-]*$'; \
    echo "$OLLAMA_MODEL_MANIFEST_SHA256" | grep -Eq '^[0-9a-f]{64}$'; \
    ollama serve >/tmp/ollama-build.log 2>&1 & server_pid=$!; \
    trap 'kill "$server_pid" 2>/dev/null || true' EXIT; \
    ready=0; \
    for attempt in $(seq 1 60); do \
      if ollama list >/dev/null 2>&1; then ready=1; break; fi; \
      sleep 1; \
    done; \
    test "$ready" = "1"; \
    ollama pull "$OLLAMA_MODEL_REF"; \
    model_name="${OLLAMA_MODEL_REF%%:*}"; \
    model_tag="${OLLAMA_MODEL_REF#*:}"; \
    manifest_path="/root/.ollama/models/manifests/registry.ollama.ai/library/${model_name}/${model_tag}"; \
    test -f "$manifest_path"; \
    actual_manifest_sha256="$(sha256sum "$manifest_path" | cut -d ' ' -f 1)"; \
    test "$actual_manifest_sha256" = "$OLLAMA_MODEL_MANIFEST_SHA256"; \
    kill "$server_pid"; \
    wait "$server_pid" 2>/dev/null || true; \
    trap - EXIT

EXPOSE 11434
ENTRYPOINT ["/bin/ollama"]
CMD ["serve"]
