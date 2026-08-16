# dsh-worktree

[![CI](https://github.com/pengkodam/dsh-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/pengkodam/dsh-lab/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/pengkodam/dsh-lab)](https://github.com/pengkodam/dsh-lab/releases/latest)
[![License](https://img.shields.io/github/license/pengkodam/dsh-lab)](./LICENSE)

Read-only Git worktree intelligence for DeepSeek Harness.

The bundle registers three zero-argument model tools for the repository containing the directory from which Harness was launched:

- `git_worktree_list` discovers every associated worktree and identifies the primary record.
- `git_worktree_status` reports local staged, unstaged, untracked, conflicted, and locally known upstream state.
- `git_worktree_compare` compares committed linked-worktree HEADs with the captured primary worktree HEAD.

The tools accept no model-supplied path, revision, executable, or Git option.

## Release status

`1.0.0` passed the automated suite and package dry run on Windows and Ubuntu with Node `22.19.0` and Node `24`. Packed-artifact installation, configuration composition, no-API boot, direct tool acceptance, API-backed model selection, session auditing, and removal were validated with DeepSeek Harness `0.1.0-rc.6`.

The v0.1 baseline was installed, composed, boot-smoke-tested, and API acceptance-tested with DeepSeek Harness `0.1.0-rc.6` on 2026-08-14. Harness is in developer preview, so repeat the live gates after every Harness upgrade.

## Demonstration

Launch Harness from inside a repository that has linked worktrees and ask:

> Inspect every worktree in this repository. Tell me which ones have uncommitted work, how their committed changes differ from the primary worktree, and what I should review first.

An evidence-backed answer should use the dedicated tools, distinguish local changes from committed differences, and avoid claiming that any result is “safe to merge.” Upstream ahead/behind facts use local refs; the tool never fetches.

For a deterministic two-worktree fixture and the expected facts, follow the repository's [60-second demonstration](../../README.md#60-second-demonstration).

## Canonical facts

Discovery includes:

- worktree path and full HEAD object ID;
- short branch and full ref, or `null` for detached/bare records;
- explicit primary-worktree identity; and
- detached, bare, locked, and prunable states with optional reasons.

Status includes:

- clean/dirty state;
- staged, unstaged, untracked, and conflicted counts;
- local upstream and ahead/behind facts; and
- explicit bare, prunable, or otherwise unavailable representation.

Comparison includes:

- primary baseline identity;
- identical, ahead, behind, diverged, unrelated, or unavailable relationship;
- commits unique to each side;
- merge base when one exists; and
- a bounded committed-file summary since target divergence.

## Safety model

- Git is executed directly with fixed argv arrays and no shell.
- Every subprocess receives `LC_ALL=C` and `GIT_OPTIONAL_LOCKS=0`.
- Discovery paths and revisions are validated Git output, never model input.
- Execution is cancellable, deadline-bound, and buffer-limited.
- Diagnostics are sanitized and capped.
- Unexpected partial failure fails the complete tool call.
- Integration tests compare refs, working files, and index bytes before and after inspection.

## Requirements

- Node `^22.19.0 || >=24.0.0`
- Git with `worktree list --porcelain -z` and status porcelain v2 support
- A compatible DeepSeek Harness developer-preview release

The release matrix is:

| Environment | Node | Result |
| --- | --- | --- |
| Windows | `22.19.0`, `24` | Tests and package dry run pass |
| Ubuntu | `22.19.0`, `24` | Tests and package dry run pass |
| DeepSeek Harness | `0.1.0-rc.6` with Node `24.19.0` | Packed activation and model-backed demonstration pass |

The local Git acceptance baseline is `2.39.1.windows.1`. Full evidence is recorded in the release acceptance document.

## Test locally

The package has no runtime or test dependencies:

```powershell
cd plugins/dsh-worktree
node --test
npm pack --dry-run
```

## Install the released archive into an isolated profile

From any working directory with GitHub CLI available:

```powershell
gh release download v1.0.0 --repo pengkodam/dsh-lab --pattern dsh-worktree-1.0.0.tgz
dsh plugin --profile worktree-demo add ./dsh-worktree-1.0.0.tgz
dsh plugin --profile worktree-demo add @deepseek-ai/dsh-headless@0.1.0-rc.6
dsh --profile worktree-demo --dump-config
dsh --profile worktree-demo "Inspect every worktree in this repository."
```

The configuration dump should contain a `dsh-worktree` layer and a plugin row with `id: dsh-worktree`. The final model-backed command requires `DEEPSEEK_API_KEY` to already be set in the environment. Omit the headless package and final command if only configuration composition is being checked.

## Install from a source checkout

Run from the `dsh-lab` project root:

```powershell
dsh plugin --profile lab add ./plugins/dsh-worktree
dsh --profile lab --dump-config
dsh --profile lab
```

This form links the working directory and is intended for plugin development. Use the released archive when reproducing acceptance evidence.

## Upgrade the isolated profile

When the profile already links this local directory, restart Harness after changing the package. For a packed-artifact acceptance run, remove the existing link and install the exact archive under test in a disposable profile.

## Remove

```powershell
dsh plugin --profile lab remove dsh-worktree
dsh --profile lab --dump-config
```

The profile should still compose successfully and should no longer expose any `git_worktree_*` tool.

## Errors

- `NOT_A_GIT_REPOSITORY`: restart Harness from inside a Git repository.
- `GIT_NOT_FOUND`: install Git or correct `PATH` before starting Harness.
- `ABORTED`: retry if the cancellation was unintended.
- `TIMEOUT`: check repository metadata and storage responsiveness.
- `REPOSITORY_CHANGED`: retry when concurrent branch activity has settled.
- `GIT_COMMAND_FAILED`: inspect the bounded diagnostic and repository health.
- `INVALID_GIT_OUTPUT`: compare installed Git output with the supported machine formats before trusting a partial interpretation.

Errors omit stack traces and unbounded process output.
