# Go AI-Driven Development Pipeline Template

A production-ready template for Go projects with AI-assisted development, featuring comprehensive CI/CD, code quality enforcement, and automated releases.

## Features

- **Go 1.21+** - Modern Go with latest language features
- **Cross-platform testing** - Ubuntu, macOS, Windows
- **Comprehensive testing** - Race detection, coverage reporting
- **Code quality** - gofmt, go vet, staticcheck
- **Pre-commit hooks** - Automatic formatting and linting
- **CI/CD pipeline** - GitHub Actions with full automation
- **Changeset workflow** - Version management without merge conflicts
- **Release automation** - Automatic and manual release modes
- **File size limits** - Enforced 1000-line maximum per file

## Quick Start

### Use This Template

1. Click "Use this template" on GitHub
2. Clone your new repository
3. Update module name in `go.mod`
4. Update package name in `pkg/mypackage/`
5. Start developing!

### Development Setup

```bash
# Clone the repository
git clone https://github.com/link-foundation/go-ai-driven-development-pipeline-template.git
cd go-ai-driven-development-pipeline-template

# Run tests
go test ./...

# Run with race detection
go test -race ./...

# Build
go build ./...

# Run example
go run examples/basic_usage.go
```

### Install Pre-commit Hooks (Recommended)

```bash
pip install pre-commit
pre-commit install
```

## Project Structure

```
.
├── .changeset/
│   ├── config.json              # Changeset configuration
│   └── README.md                # Changeset instructions
├── .github/
│   └── workflows/
│       └── release.yml          # CI/CD pipeline
├── examples/
│   └── basic_usage.go           # Usage examples
├── pkg/
│   └── mypackage/
│       ├── mypackage.go         # Main library code
│       └── mypackage_test.go    # Tests
├── scripts/
│   ├── check-file-size.mjs      # File size validation
│   ├── create-github-release.mjs # Release creation
│   ├── merge-changesets.mjs     # Merge multiple changesets
│   ├── validate-changeset.mjs   # PR validation
│   └── version-and-commit.mjs   # Full release workflow
├── .gitignore
├── .pre-commit-config.yaml      # Pre-commit hooks
├── CHANGELOG.md                 # Release changelog
├── CONTRIBUTING.md              # Contribution guidelines
├── go.mod                       # Go module definition
├── LICENSE                      # Unlicense (public domain)
└── README.md                    # This file
```

## Design Choices

### Code Quality

- **gofmt** - Standard Go formatting
- **go vet** - Static analysis for common errors
- **staticcheck** - Advanced static analysis
- **File size limits** - Maximum 1000 lines per file (encourages modularity)
- **Race detection** - All tests run with `-race` flag

### Testing Strategy

- **Table-driven tests** - Comprehensive test coverage
- **Race detection** - Concurrent safety verification
- **Cross-platform** - Tests run on Ubuntu, macOS, and Windows
- **Coverage reporting** - Automatic upload to Codecov

### Changeset Workflow

Uses a changeset-based system similar to [Changesets](https://github.com/changesets/changesets) for JavaScript:

1. Each PR adds a `.md` file to `.changeset/`
2. Changeset specifies version bump type (patch/minor/major)
3. No merge conflicts between concurrent PRs
4. Automatic version bumping after merge
5. Safe, conflict-free version management

Example changeset file (`.changeset/add-new-feature.md`):

```markdown
---
'go-ai-driven-development-pipeline-template': minor
---

Added new feature for doing awesome things.
```

### CI/CD Pipeline

The pipeline includes:

1. **Changeset check** - PR validation for changeset files
2. **Lint job** - Formatting, vetting, static analysis, file size checks
3. **Test job** - Multi-platform testing with coverage
4. **Build job** - Package verification
5. **Auto-release** - Triggered when PRs with changesets are merged
6. **Manual release** - Workflow dispatch with instant or changeset mode

### Release Automation

Two release modes:

1. **Automatic**: Merge a PR with a changeset, version is bumped and released
2. **Manual**: Trigger workflow dispatch:
   - `instant` - Immediate release with specified bump type
   - `changeset` - Process existing changesets

## Configuration

### Updating Package Name

1. Update `go.mod`:
   ```go
   module github.com/your-org/your-package
   ```

2. Rename `pkg/mypackage/` to your package name

3. Update imports in all files

4. Update `PACKAGE_NAME` in:
   - `scripts/validate-changeset.mjs`
   - `scripts/merge-changesets.mjs`
   - `scripts/version-and-commit.mjs`

### Customizing Linting

Add a `staticcheck.conf` file for custom rules:

```
checks = ["all", "-ST1000"]
```

### Adjusting File Size Limit

```bash
bun scripts/check-file-size.mjs --max-lines 1500
```

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `check-file-size.mjs` | Validate file line counts |
| `create-github-release.mjs` | Create GitHub release |
| `merge-changesets.mjs` | Combine multiple changesets |
| `validate-changeset.mjs` | Check for changeset in PR |
| `version-and-commit.mjs` | Full release workflow |

## Example Usage

```go
package main

import (
    "context"
    "fmt"
    "time"

    "github.com/link-foundation/go-ai-driven-development-pipeline-template/pkg/mypackage"
)

func main() {
    // Integer arithmetic
    sum := mypackage.Add(5, 3)
    fmt.Printf("5 + 3 = %d\n", sum)

    product := mypackage.Multiply(4, 7)
    fmt.Printf("4 * 7 = %d\n", product)

    // Float arithmetic
    floatSum := mypackage.AddFloat(2.5, 3.7)
    fmt.Printf("2.5 + 3.7 = %.2f\n", floatSum)

    // Delay with context
    ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
    defer cancel()

    err := mypackage.Delay(ctx, 50*time.Millisecond)
    if err != nil {
        fmt.Printf("Delay cancelled: %v\n", err)
    }
}
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and guidelines.

## License

This project is released into the public domain under the [Unlicense](LICENSE).
