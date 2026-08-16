# PRD — dsh-lab: Local DeepSeek Harness Worktree Plugin

**Product:** `dsh-lab`  
**Initial bundle:** `dsh-worktree`  
**Target release:** v0.1  
**Status:** Ready for technical specification  
**Last revised:** 2026-08-14

## 1. Product Summary

`dsh-lab` is a local, disposable development project for extending DeepSeek Harness without changing the upstream Harness repository. Its first bundle, `dsh-worktree`, gives the model one dependable, read-only primitive: inspect every Git worktree associated with the repository from which Harness was launched.

The user should be able to ask a natural-language question such as:

> List the worktrees for this repository and tell me which one is the main worktree.

Harness should invoke `git_worktree_list` and answer from the tool's structured result.

This release proves two things:

1. An out-of-tree bundle can be installed, loaded, and removed through an isolated Harness profile.
2. A model-facing tool can convert real Git state into reliable structured data without mutating the repository.

## 2. Problem and Opportunity

Git worktrees are a natural isolation boundary for future agent delegation, but Harness cannot orchestrate them safely until it can first observe them accurately. Shell access alone is not a sufficient product primitive: it leaves tool selection, parsing, edge-case handling, and result shape up to the model on every request.

`dsh-worktree` creates a narrow capability with a stable contract. Later versions can build create, delegate, compare, review, and merge workflows on top of that contract.

## 3. Goals

### v0.1 goals

- Prove external bundle development without edits under the DeepSeek Harness source tree.
- Keep development isolated from the user's normal Harness profiles.
- Expose one discoverable, read-only model tool named `git_worktree_list`.
- Return enough structured data to identify the main worktree and explain unusual worktree states.
- Behave consistently from a repository root, a nested directory, or a linked worktree.
- Fail safely and actionably when Git or repository context is unavailable.
- Remain small enough to delete, reinstall, and understand end to end.

### Product principle

Build one dependable primitive at a time:

```text
inspect → create → delegate → compare → review → merge
```

## 4. Non-Goals

v0.1 will not:

- create, move, lock, unlock, prune, repair, or remove worktrees;
- modify branches, the index, commits, remotes, or repository configuration;
- report dirty-file status, diffs, ahead/behind counts, or merge readiness;
- accept an arbitrary repository path from the model;
- delegate to subagents or run agents concurrently;
- implement review, merge, or autonomous coding loops;
- add remote execution, Docker, database persistence, telemetry, or a custom UI;
- modify files under `deepseek-harness/packages/` or require a fork of Harness;
- promise compatibility across breaking Harness developer-preview releases.

These omissions are deliberate. v0.1 is an inspection primitive, not a worktree manager.

## 5. Target User

The initial user is a developer experimenting with DeepSeek Harness locally who:

- already has Git and Harness installed;
- wants to author plugins outside the Harness checkout;
- needs an isolated profile for experiments; and
- plans to use worktrees as isolated agent workspaces later.

No special Git worktree knowledge should be required to ask the agent what exists or which worktree is primary.

## 6. User Journey

1. The developer installs the local `dsh-worktree` bundle into a dedicated `lab` profile.
2. The developer verifies that the composed profile contains the bundle.
3. From any directory inside a Git working tree, the developer starts Harness with the `lab` profile.
4. The developer asks a natural-language question about the repository's worktrees.
5. The model selects `git_worktree_list` without being told to run a shell command.
6. The tool inspects the repository associated with the Harness launch directory and returns structured data.
7. The model explains the result, including which entry is the main worktree and any detached, bare, locked, or prunable states.
8. If the launch directory is not in a Git repository, the user receives a concise recovery message and no repository state changes.

## 7. Functional Requirements

### FR-1 — External bundle lifecycle

As a plugin developer, I want the bundle to live outside the Harness source tree so that I can iterate without maintaining an upstream fork.

Acceptance criteria:

- The bundle has its own package manifest, runtime entry point, bundle patch, README, and tests.
- Its package manifest declares a Harness bundle and points to its patch file.
- The bundle patch inserts the runtime plugin by package name.
- Installing the local directory into the `lab` profile activates it as a profile layer.
- Removing the package removes that layer without changing other profiles.
- No file under the upstream Harness checkout is created or modified.

### FR-2 — Isolated development profile

As a Harness user, I want experiments contained in a `lab` profile so that my normal setup remains unaffected.

Acceptance criteria:

- First installation creates or reuses the named `lab` profile.
- `dsh --profile lab --dump-config` shows the `dsh-worktree` layer and inserted plugin row.
- Booting `dsh --profile lab` succeeds with the plugin enabled.
- A profile that does not list the bundle has no `git_worktree_list` tool.
- Uninstalling the bundle returns the `lab` profile to a bootable state.

### FR-3 — Model-facing tool registration

As a user, I want the agent to recognize worktree questions as a dedicated capability so that it does not have to improvise shell commands or parsing.

Acceptance criteria:

- The plugin registers exactly one v0.1 model-facing tool named `git_worktree_list`.
- The tool description states that it lists worktrees for the Git repository containing the Harness launch directory.
- The tool takes no model-supplied path or command arguments.
- The tool declares a canonical structured output schema and a readable model-facing rendering.
- Asking “What worktrees exist in this repo?” causes a recorded `git_worktree_list` call in an end-to-end test.

### FR-4 — Repository selection

As a user, I want “this repository” to have one predictable meaning so that the tool never inspects an unintended path.

Acceptance criteria:

- v0.1 defines the target as the Git repository containing the process working directory from which Harness was launched.
- Invocation from the repository root and from a nested directory returns the same worktree set.
- Invocation from a linked worktree returns the full set belonging to the same common repository.
- The model cannot override the working directory in v0.1.
- The implementation never builds a shell command by concatenating model-provided text.

### FR-5 — Git inspection

As a user, I want complete worktree metadata from Git's stable machine-readable interface so that the result is trustworthy.

Acceptance criteria:

- The tool invokes `git worktree list --porcelain -z` in the defined working directory.
- Parsing uses NUL delimiters and supports paths or reasons containing whitespace and line breaks.
- Record order is preserved. The first Git record is marked `isMain: true`; every later record is `false`.
- The parser handles branch-attached, detached, bare, locked, and prunable records.
- Unknown future porcelain attributes do not crash parsing and are ignored unless they invalidate a required record boundary.
- The command is read-only and leaves the worktree list, refs, index, and working files unchanged.

### FR-6 — Structured result contract

As a future workflow author, I want an unambiguous JSON result so that later tools can consume it without parsing prose.

Each successful result returns an object with `worktrees`, an ordered array of records with this semantic shape:

```json
{
  "worktrees": [
    {
      "path": "D:/Projects/demo",
      "head": "abc123abc123abc123abc123abc123abc123abcd",
      "branch": "main",
      "ref": "refs/heads/main",
      "isMain": true,
      "detached": false,
      "bare": false,
      "locked": false,
      "lockReason": null,
      "prunable": false,
      "prunableReason": null
    }
  ]
}
```

Contract rules:

- `path` is the path reported by Git and is never inferred from the branch name.
- `head` is the full object ID reported by Git, or `null` for a record for which Git reports no HEAD.
- `ref` preserves Git's full branch ref; `branch` removes only the `refs/heads/` prefix for display.
- `branch` and `ref` are `null` for detached or bare records.
- `locked` and `prunable` are booleans; their reason fields are nullable strings.
- `isMain` is explicit so the model does not guess that `main`, `master`, or any other branch name defines the main worktree.
- A repository with only its main worktree returns one record, not an empty result.

### FR-7 — Errors and recovery

As a user, I want failures to explain what I can do next without exposing noisy internal details.

Acceptance criteria:

- Outside a Git repository, the tool returns a stable `NOT_A_GIT_REPOSITORY` error and suggests launching Harness from within a repository.
- If the Git executable cannot be started, the tool returns `GIT_NOT_FOUND` and suggests installing Git or fixing `PATH`.
- Cancellation returns `ABORTED`; a configured deadline returns `TIMEOUT`.
- A nonzero Git exit not covered above returns `GIT_COMMAND_FAILED` with bounded, sanitized diagnostic text.
- Malformed output returns `INVALID_GIT_OUTPUT`; partial records are never presented as a successful complete list.
- User-facing errors do not include a JavaScript stack trace, secrets, environment dumps, or unbounded stdout/stderr.
- All failure paths remain read-only.

## 8. Edge Cases

v0.1 must explicitly cover:

- a repository with only the main worktree;
- multiple linked worktrees on different branches;
- execution while Harness was launched from a linked worktree;
- execution from a nested directory inside a worktree;
- a detached-HEAD worktree;
- a locked worktree, with and without a reason;
- a prunable record, including its reason;
- a bare repository record;
- spaces and non-ASCII characters in worktree paths;
- line breaks in paths or lock reasons, protected by `-z` parsing;
- CRLF and LF environments where applicable;
- Git unavailable on `PATH`;
- the launch directory not belonging to a Git repository;
- command cancellation, deadline expiry, and malformed output;
- additional porcelain attributes introduced by a future Git release.

## 9. Quality and Safety Requirements

### Reliability

- Parsing is deterministic and isolated from presentation rendering.
- The tool returns a complete result or a typed error; it does not return silent partial success.
- Child-process stdout and stderr are bounded to prevent accidental memory growth.
- The child process honors the Harness tool cancellation signal.

### Security

- The tool is read-only by design and registers no mutating capability.
- It executes Git directly with a fixed argument array, not through a shell string.
- v0.1 accepts no arbitrary path, executable, or extra Git arguments from the model.
- Diagnostics are sanitized and bounded before becoming model-visible.

### Compatibility

- Supported operating systems for v0.1 are Windows, macOS, and Linux where the chosen Harness release and Git are supported.
- The technical specification must pin and record the Harness version or commit used for validation because Harness is in developer preview and may introduce breaking plugin API changes.
- The package must state its tested Harness and minimum Git versions; unsupported versions fail clearly rather than silently degrading.

### Maintainability

- Runtime code, porcelain parsing, rendering, and tests remain separable.
- The README includes install, verify, run, uninstall, troubleshooting, and compatibility instructions.
- Deleting the project directory and uninstalling the profile dependency leaves no required repository-local state behind.

## 10. Verification Plan

### Automated parser tests

Fixture-based tests must cover:

- one main worktree;
- multiple attached branches;
- detached and bare records;
- locked and prunable records with and without reasons;
- NUL-delimited unusual paths and reasons;
- unknown attributes;
- missing record boundaries and malformed required fields.

### Automated integration tests

Tests create a temporary Git repository and verify:

- root and nested-directory invocation;
- at least one linked worktree;
- a detached worktree;
- correct `isMain` assignment and branch normalization;
- no before/after change to refs or working-tree status;
- typed behavior outside a repository and when Git execution fails.

### Manual Harness acceptance

Using the pinned Harness build:

1. Install the local bundle into `lab`.
2. Confirm its layer in `--dump-config`.
3. Boot the `lab` profile from a test repository.
4. Ask: “What worktrees exist in this repo?”
5. Confirm the session records a `git_worktree_list` call.
6. Ask: “Which one is the main worktree, and are any detached, locked, or prunable?”
7. Confirm the answer matches Git's actual state.
8. Repeat from outside a repository and confirm the recovery message.
9. Remove the bundle and confirm the profile still boots without the tool.

## 11. Delivery Milestones

### Milestone 0 — Contract spike

- Pin the Harness version or commit used for v0.1.
- Prove the smallest out-of-tree bundle can be installed into `lab` and shown in `--dump-config`.
- Confirm the exact public tool-registration and subprocess APIs to use.

Exit criterion: an external bundle loads without upstream changes, and all compatibility assumptions are recorded.

### Milestone 1 — Pure parser and result schema

- Define the canonical output and typed error contracts.
- Implement the `--porcelain -z` parser independently of Harness.
- Complete parser fixtures for all required record states.

Exit criterion: parser tests pass without executing Harness.

### Milestone 2 — Read-only Git adapter

- Execute the fixed Git command in the Harness launch directory.
- Add cancellation, deadline, output bounds, and error mapping.
- Complete temporary-repository integration tests.

Exit criterion: real Git repositories produce complete structured results with no mutation.

### Milestone 3 — Harness tool and bundle

- Register `git_worktree_list` with its schema, canonical output, and model-facing renderer.
- Package the runtime as an installable bundle and document its lifecycle.

Exit criterion: `lab` boots with the tool visible while unrelated profiles remain unaffected.

### Milestone 4 — End-to-end acceptance

- Run the manual Harness scenarios.
- Record evidence of tool selection, correct main-worktree identification, edge-state explanations, and uninstall behavior.

Exit criterion: every Definition of Done item below has evidence.

## 12. Definition of Done

v0.1 is complete only when:

- the bundle installs, appears in the `lab` profile composition, boots, and uninstalls cleanly;
- no upstream Harness source file is modified;
- only the dedicated profile gains the tool;
- `git_worktree_list` is model-visible and selected for a natural-language worktree request;
- its successful result conforms to the documented structured contract;
- main, linked, detached, bare, locked, and prunable records are handled correctly;
- root, nested-directory, and linked-worktree invocation identify the same repository set;
- not-a-repository, Git-missing, cancellation, timeout, command-failure, and malformed-output paths are actionable and typed;
- automated parser and integration tests pass on the supported environments;
- inspection produces no repository mutation; and
- the README documents compatibility, installation, verification, use, troubleshooting, and removal.

## 13. Future Releases

Future scope is intentionally gated on v0.1's stable inspection contract.

### Candidate v0.2 — Create safely

Add `git_worktree_create` with explicit path, branch/base, collision checks, and confirmation policy. Do not assume `.worktrees/<name>` until the path convention and sandbox boundary are specified.

### Candidate v0.3 — Inspect change state and remove safely

Add focused tools for worktree status, diff, and guarded removal. Removal must account for dirty, locked, missing, and main-worktree states without default force behavior.

### Candidate v0.4 — Delegate one task

Create one isolated worktree, delegate one bounded task to one agent, and return a structured change summary and diff for human review. Merge remains a separate, explicitly approved step.

## 14. Assumptions and Decisions to Carry into the Technical Spec

- **Confirmed:** Harness supports out-of-tree bundles installed into named profiles and model-facing tools registered through `ctx.tools`.
- **Confirmed:** Git documents porcelain output as stable for scripts and recommends combining it with `-z`.
- **Decision:** v0.1 derives the repository from Harness's launch working directory and exposes no model-controlled `cwd`.
- **Decision:** the first record from Git is the main worktree; branch naming is never used to infer this.
- **Decision:** v0.1 returns state metadata reported by `git worktree list`, not dirty-file status.
- **Open for the technical spec:** select the Harness-provided subprocess/sandbox seam if it can satisfy fixed argv, cwd, cancellation, deadline, and output-bound requirements; otherwise document the smallest safe Node subprocess adapter.
- **Open for the technical spec:** pin the exact Harness build and determine the lowest Git version validated in CI.

## 15. Reference Baseline

This PRD was checked against the upstream DeepSeek Harness architecture, plugin packaging tutorial, tool-authoring reference, CLI profile behavior, and the official Git worktree porcelain format on 2026-08-14. These are fast-moving implementation references, not permanent compatibility guarantees.

- [DeepSeek Harness architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [Package and install a Harness plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [Harness tool-authoring reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md)
- [Harness CLI and profile behavior](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md)
- [Git worktree porcelain format](https://git-scm.com/docs/git-worktree#_porcelain_format)
