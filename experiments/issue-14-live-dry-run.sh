#!/usr/bin/env bash
# Read-only reproduction of issue #14 against a real run in which GitHub never
# acquired a hosted macOS runner: links-notation run 41477660740, job
# `kotlin / ios`. Nothing is rerun (--dry-run); the gate only reads the API.
set -euo pipefail
repository=link-foundation/links-notation
run_id=41477660740
CI_VERBOSE=true bun scripts/ci/rerun-unacquired.mjs \
  --repository "$repository" --run-id "$run_id" --attempt 1 --dry-run \
  --gate-job "release / summary" || echo "rerun-unacquired exit=$?"
NEEDS_JSON='{"kotlin":{"result":"failure"}}' REPOSITORY="$repository" RUN_ID="$run_id" \
  bun scripts/ci/check-pipeline-status.mjs || echo "check-pipeline-status exit=$?"
