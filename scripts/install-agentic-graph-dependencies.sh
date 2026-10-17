#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${AGENTIC_BASE_READ_KEY:-}" ]]; then
  echo "AGENTIC_BASE_READ_KEY is required to install the pinned private Base package" >&2
  exit 1
fi

umask 077
key_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/agentic-base-read.XXXXXX")"
key_file="$key_dir/id_ed25519"
known_hosts="$key_dir/known_hosts"
cleanup() { rm -rf "$key_dir"; }
trap cleanup EXIT

printf '%s\n' "$AGENTIC_BASE_READ_KEY" > "$key_file"
printf '%s\n' 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' > "$known_hosts"
chmod 600 "$key_file" "$known_hosts"
unset AGENTIC_BASE_READ_KEY

export GIT_CONFIG_COUNT=2
export GIT_CONFIG_KEY_0=url.https://github.com/.insteadOf
export GIT_CONFIG_VALUE_0=ssh://git@github.com/
# The longer exact URL keeps the private Base dependency on its scoped SSH key.
export GIT_CONFIG_KEY_1=url.ssh://git@github.com/huijoohwee/agentic-base.git.insteadOf
export GIT_CONFIG_VALUE_1=ssh://git@github.com/huijoohwee/agentic-base.git
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="ssh -i \"$key_file\" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=\"$known_hosts\""

# Lifecycle scripts wait until the temporary private key has been removed.
npm ci --ignore-scripts --no-audit --no-fund
rm -rf "$key_dir"
trap - EXIT
unset GIT_SSH_COMMAND GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 GIT_CONFIG_KEY_1 GIT_CONFIG_VALUE_1 GIT_TERMINAL_PROMPT
npm rebuild --no-audit --no-fund
