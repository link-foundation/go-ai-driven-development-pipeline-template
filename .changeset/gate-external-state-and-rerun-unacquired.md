---
'go-ai-driven-development-pipeline-template': patch
---

Fail CI on newer upstream releases of pinned dependencies only on pull requests; warn with a job summary on push, schedule and manual runs, and add Dependabot for pinned actions. Add a terminal Pipeline Status gate that reports jobs that never got a hosted runner as "Hosted runner not acquired", and rerun such runs automatically at most twice. Bump Bun to 1.4.4, Go to 1.27.3 and staticcheck to 2026.2.2 in CI.
