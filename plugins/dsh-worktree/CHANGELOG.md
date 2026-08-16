# Changelog

All notable changes to `dsh-worktree` are documented here. The project follows Semantic Versioning.

## 1.0.0-rc.2 — 2026-08-15

### Fixed

- Removed the unsupported JSON Schema `minimum` keyword from nullable integer output fields so the three-tool bundle loads under the Harness `0.1.0-rc.6` schema subset.

### Added

- A recursive schema-subset regression test covering every registered tool parameter and output schema.

## 1.0.0-rc.1 — 2026-08-15

### Added

- `git_worktree_status`, a zero-argument tool that reports staged, unstaged, untracked, conflicted, upstream, ahead, and behind facts for every associated worktree.
- `git_worktree_compare`, a zero-argument tool that compares every linked worktree HEAD with the captured primary worktree HEAD.
- Relationship classification for identical, ahead, behind, diverged, unrelated, and unavailable worktrees.
- Bounded committed-file summaries with explicit rename/copy source paths and truncation signals.
- Snapshot-consistency errors when status identity changes during inspection.
- Real-repository tests covering status, comparison graphs, and byte-for-byte index preservation.
- Multi-platform CI definition for supported Node releases.

### Changed

- Git execution is shared across tools and always uses fixed argv, `LC_ALL=C`, `GIT_OPTIONAL_LOCKS=0`, bounded buffers, cancellation, and deadlines.
- Discovery validates full SHA-1 or SHA-256 object IDs and rejects inconsistent object formats.
- Package description and documentation now describe the three-tool read-only workflow.

### Compatibility

- The v0.1 `git_worktree_list` successful canonical output remains unchanged.
- This candidate still targets the DeepSeek Harness developer-preview contract validated for v0.1; live v1 activation and model-selection acceptance must pass before the final `1.0.0` tag.

## 0.1.0 — 2026-08-14

- Added the zero-argument `git_worktree_list` discovery tool.
- Validated local bundle installation, profile composition, no-API activation, and API-backed model selection with DeepSeek Harness `0.1.0-rc.6`.
