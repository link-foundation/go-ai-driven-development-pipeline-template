---
'go-ai-driven-development-pipeline-template': patch
---

Bound CI jobs with explicit timeouts. Run required checks before publishing a release and fail manual runs if the selected release does not complete. Reject unavailable Git comparisons and verify immutable pins even when their declared versions are stale.
