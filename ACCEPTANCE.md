# dsh-worktree v0.1 Acceptance Record

**Date:** 2026-08-14  
**Platform:** Windows  
**DeepSeek Harness:** `0.1.0-rc.6`  
**Node.js:** `v24.19.0`  
**Git:** `2.39.1.windows.1`

## Automated verification

- `node --test`: 20 passed, 0 failed.
- Real temporary repository covered main, linked, detached, and locked worktrees.
- Root, nested-directory, and linked-worktree invocation returned the same set.
- Git refs and working-tree status were unchanged before and after inspection.
- Package archive contained only the declared runtime and documentation files.

## Harness integration

- Global CLI installation succeeded for `@deepseek-ai/dsh@0.1.0-rc.6`.
- `lab` profile initialized and linked the local `dsh-worktree` bundle.
- `--dump-config` showed the `dsh-worktree` bundle layer and plugin row.
- A no-API boot smoke test stayed active without a plugin activation error.
- A separate `lab-headless` profile combined the official headless runner with the local bundle.

## API-backed acceptance

A disposable repository was created with:

- main worktree on branch `main`;
- linked worktree on branch `feature/test`.

The headless prompt asked Harness to list worktrees, identify the main worktree, and name every branch using `git_worktree_list`.

Observed result:

- Harness exited successfully.
- The answer reported exactly two worktrees.
- It correctly identified the main worktree and both branch names.
- The persisted compressed session contained a `tool/call` event naming `git_worktree_list`.

The disposable repository was removed after the run. The API key value was never printed or written into this project and was removed from the child-process environment after the test.

## Final environment revalidation

The retained setup was revalidated on 2026-08-14 after restoring the pinned global CLI:

- `dsh --version` returned `0.1.0-rc.6`.
- The user npm binary directory is present on the user `PATH`.
- The `lab` profile still links `dsh-worktree`, and `--dump-config` contains the `dsh-worktree` plugin row.
- The `lab-headless` profile still contains `@deepseek-ai/dsh-headless` and the local `dsh-worktree` link.
- A fresh API-backed run against a disposable two-worktree repository reported exactly `main` and `feature/live-test`, and identified `main` as the primary worktree.
- The persisted successful session contained a `tool/call` event whose name was `git_worktree_list`.

Because the elevated acceptance process uses a different Windows SID from the workspace owner, that run supplied `safe.directory` through process-scoped Git environment variables. It did not change global Git configuration. The disposable repository and temporary npm cache were removed afterward.

## Remaining lifecycle check

Uninstall is intentionally not run because the verified `lab` and `lab-headless` profiles are being retained for continued use. The documented removal command remains:

```powershell
dsh plugin --profile lab remove dsh-worktree
```
