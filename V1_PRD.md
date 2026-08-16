# Product Requirements — dsh-worktree v1.0

**Product:** `dsh-worktree`  
**Release:** v1.0  
**Status:** Proposed build contract  
**Last revised:** 2026-08-15

## 1. Product Summary

`dsh-worktree` v1.0 is a read-only worktree-intelligence bundle for DeepSeek Harness. It lets a model inspect every worktree belonging to the repository from which Harness was launched, describe the local state of each worktree, and compare committed work with the primary worktree.

The release turns the validated v0.1 discovery primitive into a coherent diagnostic workflow while retaining its strongest property: the model can observe repository state, but it cannot mutate it.

## 2. Release Narrative

### Positioning

> Dependable, structured Git worktree intelligence for DeepSeek Harness.

### Demonstration moment

The primary live demonstration asks:

> Inspect every worktree in this repository. Tell me which ones have uncommitted work, how their committed changes differ from the primary worktree, and what I should review first.

A successful demonstration shows Harness selecting the dedicated tools, consuming canonical JSON, and producing an evidence-based answer without improvising shell commands or changing repository state.

### Why this release is credible

The product does not claim to prove that a branch is safe to merge. It reports observable facts and review signals: local changes, conflicts, upstream divergence, commit relationships, and changed-file summaries. Merge safety remains a human judgment.

## 3. Target User

The target user is a developer who uses Git worktrees as isolated workspaces and wants an agent to answer repository-wide questions reliably. They value:

- a predictable definition of “this repository”;
- machine-readable results rather than prose scraped from shell output;
- useful behavior from the root, a nested directory, or a linked worktree;
- explicit handling of detached, locked, prunable, bare, or unavailable worktrees; and
- confidence that inspection cannot modify Git state.

## 4. Goals

- Preserve the validated `git_worktree_list` contract from v0.1.
- Add repository-wide worktree status inspection.
- Add committed-change comparison against the primary worktree.
- Let the model synthesize a useful review order from canonical facts.
- Demonstrate multiple well-designed Harness tools in one natural-language workflow.
- Maintain fixed-command, no-shell, bounded, cancellable execution.
- Ship with reproducible automated and API-backed acceptance evidence.
- Provide a clean install, upgrade, uninstall, and package-consumption story.

## 5. Non-Goals

v1.0 will not:

- create, move, lock, unlock, repair, prune, or remove worktrees;
- stage files, commit, merge, rebase, cherry-pick, push, fetch, or modify refs;
- invoke or delegate to another coding agent;
- accept an arbitrary repository path, executable, or Git argument from the model;
- fetch remote state or imply that cached upstream information is current;
- declare a worktree “safe to merge” or predict semantic merge correctness;
- return full patches or unbounded file contents;
- add a database, daemon, remote service, telemetry system, or custom UI; or
- promise compatibility with untested breaking Harness developer-preview releases.

## 6. Product Vocabulary

- **Primary worktree:** the first record returned by `git worktree list --porcelain -z`. This is a worktree identity, not a branch-name convention.
- **Associated worktree:** any record belonging to the same common Git repository.
- **Local status:** index and working-tree facts obtained without contacting a remote.
- **Comparison:** committed history and file-change facts between a non-primary worktree HEAD and the captured primary worktree HEAD.
- **Unavailable:** a known worktree record that cannot be inspected for an expected reason such as a missing prunable path. Unavailability is explicit data, never silent omission.

## 7. User Journeys

### 7.1 Repository overview

1. The user launches Harness from anywhere inside an associated worktree.
2. The user asks what worktrees exist.
3. Harness calls `git_worktree_list`.
4. The answer identifies the primary worktree and describes unusual states.

### 7.2 Local-change triage

1. The user asks which worktrees contain unfinished local work.
2. Harness calls `git_worktree_status`.
3. The answer distinguishes staged, unstaged, untracked, and conflicted changes.
4. The answer notes that upstream counts are based on locally available refs and no fetch occurred.

### 7.3 Review preparation

1. The user asks how worktrees differ from the primary worktree.
2. Harness calls `git_worktree_compare` and, when relevant, `git_worktree_status`.
3. The answer distinguishes identical, ahead, behind, diverged, unrelated, and unavailable records.
4. The answer recommends a review order based on reported facts without making a merge-safety guarantee.

## 8. Functional Requirements

### FR-1 — Compatible bundle lifecycle

- The package remains an independently testable dependency-free ESM Harness bundle.
- Existing v0.1 profile installations can upgrade without changing the plugin identifier.
- `dsh --profile lab --dump-config` shows one `dsh-worktree` bundle layer and plugin row.
- Removal leaves the profile composable and removes all three model-facing tools.

### FR-2 — Worktree discovery

- `git_worktree_list` retains its zero-argument contract and canonical v0.1 result.
- The target repository remains the repository containing the Harness launch directory.
- Invocation from the root, a nested directory, or any associated linked worktree produces the same ordered worktree set.

### FR-3 — Repository-wide status

The bundle registers a zero-argument tool named `git_worktree_status`.

For every discovered worktree, the successful canonical result reports:

- identity: path, full HEAD, branch, and primary-worktree flag;
- availability and an optional stable unavailability reason;
- clean or dirty state;
- staged, unstaged, untracked, and conflicted entry counts;
- locally configured upstream ref, if any; and
- locally known ahead and behind counts, if Git reports them.

Additional rules:

- Bare worktrees and expected missing/prunable paths are represented explicitly as unavailable for status inspection.
- A clean worktree reports zero for every change count.
- A path is never silently omitted because it could not be inspected.
- An unexpected or ambiguous Git failure fails the complete tool call with a typed error.
- No remote operation occurs.

### FR-4 — Primary-worktree comparison

The bundle registers a zero-argument tool named `git_worktree_compare`.

- The comparison baseline is the primary worktree HEAD captured during the tool call.
- Every non-primary record is represented exactly once.
- The result reports the target path and HEAD, merge base when one exists, commits unique to each side, relationship classification, and a bounded changed-file summary for committed target work since divergence.
- Relationship is one of `identical`, `ahead`, `behind`, `diverged`, `unrelated`, or `unavailable`.
- Detached HEAD worktrees are comparable when they have valid HEAD objects.
- Bare or missing/prunable records are explicitly unavailable.
- Unrelated histories are reported without fabricating a merge base or since-divergence file summary.
- No user- or model-supplied revision is accepted in v1.0.

### FR-5 — Canonical facts and native rendering

- Every tool declares a closed JSON Schema for parameters and successful output.
- Canonical output preserves full paths, refs, object IDs, and counts.
- Native rendering is concise and escapes embedded control characters used in one-line summaries.
- Rendering does not invent readiness or merge-safety conclusions.
- File summaries are bounded by count and output size and indicate truncation explicitly.

### FR-6 — Errors and recovery

- Stable v0.1 errors remain supported: `ABORTED`, `TIMEOUT`, `GIT_NOT_FOUND`, `NOT_A_GIT_REPOSITORY`, `GIT_COMMAND_FAILED`, and `INVALID_GIT_OUTPUT`.
- v1.0 adds stable errors only when the caller can take a distinct recovery action.
- Diagnostics are sanitized, bounded, locale-stable, and contain no stack trace or environment dump.
- Cancellation stops active inspection and prevents additional per-worktree Git commands from starting.
- If a worktree HEAD changes after discovery but before its status is parsed, the call fails with `REPOSITORY_CHANGED` and suggests retrying instead of combining facts from different snapshots.
- Partial canonical success is not returned after an unexpected failure.

### FR-7 — Read-only proof

Automated integration tests record and compare, before and after each tool call:

- worktree list;
- refs and HEADs;
- index state;
- working-file content and status; and
- configured remotes and repository configuration relevant to the fixture.

The observed state must be identical after inspection.

### FR-8 — Release evidence

The repository contains reproducible evidence for:

- unit, parser, renderer, and real-repository integration tests;
- package archive contents;
- profile install and composed configuration;
- no-API boot activation;
- API-backed model selection for the demonstration prompt;
- persisted tool-call events for the tools used; and
- documented uninstall verification.

## 9. Quality Requirements

### Reliability

- Results are deterministic for a fixed repository snapshot.
- The discovery snapshot used by a tool call is immutable within that call.
- Per-worktree inspection has bounded concurrency and preserves discovery order in output.
- Output limits apply both per subprocess and to the aggregate canonical response.

### Security

- Git is executed directly with fixed argument arrays and no shell.
- Read-only Git subprocesses run with process-scoped `GIT_OPTIONAL_LOCKS=0` so inspection cannot perform optional index refresh writes.
- Worktree paths and object IDs come only from validated Git discovery output.
- A discovered path is used only as an execution working directory, never interpolated into a shell command.
- Object IDs used as revisions must match the repository’s validated object-ID format.
- No model-controlled path, revision, option, environment variable, or executable reaches Git.

### Compatibility

- The supported Harness and Node versions are pinned in release documentation.
- Tests cover Windows path behavior and remain runnable on macOS and Linux.
- Git feature requirements are documented and checked explicitly when necessary.

### Maintainability

- Process execution, discovery, status parsing, comparison parsing, canonical schemas, and rendering remain separable.
- Shared orchestration does not weaken the individual tool contracts.
- Tests use Node’s standard library unless a dependency has a documented product benefit.

## 10. Release Acceptance

v1.0 is releasable when:

1. All three tools meet their schemas and functional requirements.
2. Automated tests pass on the supported Node versions and at least Windows plus one Unix-like CI environment.
3. Read-only invariants pass against real temporary repositories.
4. A clean profile can install, activate, exercise, and remove the packaged bundle.
5. The demonstration prompt produces an accurate, evidence-based answer and persisted tool-call audit.
6. README, compatibility notes, changelog, license, package metadata, and acceptance record agree on the released behavior.

## 11. Future Direction

After v1.0, the product may explore guarded worktree creation and task delegation. Any mutating release requires a separate threat model, explicit authorization design, managed-worktree ownership rules, recovery behavior, and acceptance criteria. It is not an incremental toggle on the v1.0 read-only tools.
