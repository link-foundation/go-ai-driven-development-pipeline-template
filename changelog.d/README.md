# Changelog Fragments

This directory contains changelog fragments that will be collected into CHANGELOG.md during releases.

## Creating a Fragment

When you make a change that should be documented in the changelog, create a new file in this directory.

### Filename Format

```
YYYYMMDD_HHMMSS_short_description.md
```

Example: `20241227_143022_add_user_authentication.md`

### Content Format

Use the following sections as needed:

```markdown
### Added
- New feature description

### Changed
- Description of changes to existing functionality

### Fixed
- Bug fix description

### Removed
- Removed feature description

### Deprecated
- Deprecated feature description

### Security
- Security fix description
```

## Example Fragment

File: `20241227_143022_add_multiply_function.md`

```markdown
### Added
- Added `Multiply` and `MultiplyFloat` functions for multiplication operations
- Added comprehensive tests for new multiplication functions
```

## How It Works

1. Create a fragment file when you make changes
2. Include the fragment in your pull request
3. During release, fragments are automatically collected into CHANGELOG.md
4. Fragment files are deleted after collection

## Benefits

- **No merge conflicts**: Each PR has its own fragment file
- **Per-PR documentation**: Changes are documented at the time they're made
- **Automated collection**: Fragments are merged during release
- **Consistent formatting**: Standard sections ensure readable changelogs
