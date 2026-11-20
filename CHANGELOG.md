# Changelog

All notable changes to this project will be documented in this file.


## [0.2.0] - 2026-11-20

Bound CI jobs with explicit timeouts. Run required checks before publishing a release and fail manual runs if the selected release does not complete. Reject unavailable Git comparisons and verify immutable pins even when their declared versions are stale.

Added `.changeset` folder workflow similar to JavaScript template. This provides safe, conflict-free version management where each PR includes a changeset file that specifies the version bump type (patch/minor/major) and description. Version bumps happen automatically after PR merge, preventing merge conflicts in version files.

Fail CI on newer upstream releases of pinned dependencies only on pull requests; warn with a job summary on push, schedule and manual runs, and add Dependabot for pinned actions. Add a terminal Pipeline Status gate that reports jobs that never got a hosted runner as "Hosted runner not acquired", and rerun such runs automatically at most twice. Bump Bun to 1.4.4, Go to 1.27.3 and staticcheck to 2026.2.2 in CI.

Harden the release pipeline against cancellation races, excessive token permissions, hidden coverage upload failures, workflow input injection, and contributor-authored workflow command injection. Verify new module tags through the Go proxy before creating GitHub releases, and add automated workflow policy tests.

Fix CI/CD check differences between pull request and push events

Changes:

- Add `detect-changes` job with cross-platform `detect-code-changes.mjs` script
- Make lint job independent of changeset-check (runs based on file changes only)
- Allow docs-only PRs without changeset requirement
- Handle changeset-check 'skipped' state in dependent jobs
- Exclude `.changeset/`, `docs/`, `experiments/`, `examples/` folders and markdown files from code changes detection

Recover interrupted releases for the current tagged version when no changesets remain, preserving the version and complete changelog notes. Pin hosted runner images, update and freeze CI action and tool versions, and check dependency freshness and pin integrity on workflow changes and weekly.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- changelog-insert-here -->

## [0.1.0] - 2024-12-27

### Added
- Initial project structure with Go module setup
- Core arithmetic functions: `Add`, `AddFloat`, `Multiply`, `MultiplyFloat`
- Async delay utilities with context support: `Delay`, `DelaySimple`
- Comprehensive test suite with table-driven tests
- Example usage in `examples/basic_usage.go`
- CI/CD pipeline with GitHub Actions
- Multi-platform testing (Ubuntu, macOS, Windows)
- Code quality checks (gofmt, go vet, staticcheck)
- Fragment-based changelog management
- Pre-commit hooks configuration
- Automated release workflow with manual trigger option
- Bun-based scripts for CI/CD automation
