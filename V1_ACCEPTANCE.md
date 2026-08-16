# dsh-worktree v1.0 Acceptance Record

- **Candidate:** `1.0.0`
- **Date:** 2026-08-16
- **Platform:** Windows locally; Windows and Ubuntu in GitHub Actions
- **DeepSeek Harness:** `0.1.0-rc.6`
- **Node.js:** `v24.19.0`
- **Git:** `2.39.1.windows.1`
- **Status:** Local, package, Harness, and pre-promotion multi-platform gates verified

## Local automated verification

- `node --test`: 49 passed, 0 failed.
- The v0.1 `git_worktree_list` canonical contract remains covered.
- Shared process tests verify fixed argv, no shell, `LC_ALL=C`, `GIT_OPTIONAL_LOCKS=0`, timeouts, cancellation, bounded buffers, and sanitized diagnostics.
- Parser tests cover status porcelain v2, name-status output, SHA-1/SHA-256-compatible validation, malformed output, and mixed-snapshot rejection.
- Real temporary repositories cover:
  - primary, linked, and detached worktrees;
  - staged, unstaged, untracked, clean, and locked states;
  - identical, ahead, behind, diverged, and unrelated histories; and
  - unusual paths and bounded structured rendering.
- Status and comparison integration tests verify refs, working content, and byte-for-byte index data remain unchanged.

## Candidate package verification

- `npm pack --dry-run --json` succeeded with a task-scoped temporary cache.
- `pnpm pack --dry-run --json` independently reported the same declared file set.
- The final packed archive is `dsh-worktree-1.0.0.tgz`.
- The pnpm-built archive is 12,692 bytes with SHA-256 `96ab106b8e7d68711b5dc19850eaf4277fccfd3fc8420f55d68e338494deb832`.
- npm’s independent dry run projected a 12,595-byte archive, 44,620 unpacked bytes, and the same 16-file set; npm and pnpm use different tarball serialization, so their archive byte hashes are not expected to match.
- The archive contains 16 declared files: manifest, license, README, changelog, bundle patch, runtime entry, and runtime source modules.
- Tests, fixtures, workspace planning documents, credentials, caches, and unrelated files are absent.

## Multi-platform CI

- The [pre-promotion `main` run](https://github.com/pengkodam/dsh-lab/actions/runs/31916423161) passed on GitHub-hosted Windows and Ubuntu with Node `22.19.0` and Node `24`.
- Every job ran all 49 tests and `npm pack --dry-run` successfully.
- The Windows path-spelling regression exposed by the first remote run was corrected in [PR #1](https://github.com/pengkodam/dsh-lab/pull/1) by comparing Git's canonical top-level path; the product implementation did not change.
- The release branch upgrades the official checkout and setup-node actions to their Node 24 runtime releases. Final branch evidence is recorded before tagging.

## Harness integration

Completed for this candidate:

- The exact final `1.0.0` archive was installed into a new disposable `lab-v1-final` profile.
- Final-package `--dump-config` composition contained the `dsh-worktree` layer and plugin row.
- `scripts/accept-plugin.mjs` imported the installed final package and reported the intended three tools, two fixture worktrees, one primary untracked file, and the linked worktree one commit ahead.
- The final-package interactive process stayed active for the no-API smoke interval and was then cancelled intentionally.
- Reinstalling the same final archive succeeded, removal succeeded, and the post-removal profile composed without a `dsh-worktree` layer or plugin row.

Completed for the runtime-identical release candidate:

- The exact packed archive was installed into a new isolated `lab-v1-rc` profile.
- `--dump-config` composed successfully and contained the `dsh-worktree` layer plus `id: dsh-worktree` plugin row.
- A no-API interactive boot remained active for the smoke interval and was then cancelled without a plugin activation error.
- The official `@deepseek-ai/dsh-headless@0.1.0-rc.6` runner was added to the isolated profile for the model-backed gate.
- `scripts/accept-plugin.mjs` imported the exact installed package from the profile and exercised all three exported tool definitions against a disposable repository.
- Packed-artifact results reported two worktrees, one untracked primary-worktree file, one linked commit ahead, and the expected committed file.
- After explicit user authorization, the API-backed headless run used only the generated `.acceptance-demo-v1` fixture.
- Because the elevated acceptance process uses a different Windows SID, the successful run supplied two process-scoped `safe.directory` values for the generated main and linked worktrees. Global and system Git configuration were unchanged.
- The final answer reported exactly two worktrees, one untracked file in the primary `main` worktree, a clean `feature/demo` worktree, and `feature/demo` one commit and one file ahead of the primary worktree.
- The persisted compressed session contained 90 events across 47 concatenated zstd frames. `scripts/audit-session.mjs` found three `tool/call` events naming `git_worktree_list`, `git_worktree_status`, and `git_worktree_compare`.
- Removing `dsh-worktree` from `lab-v1-rc` succeeded. A subsequent `--dump-config` exited successfully, retained the official headless runner, and contained no `dsh-worktree` layer or plugin row.
- The generated `.acceptance-demo-v1` fixture and known-broken rc.1 tarball were removed after evidence capture. `scripts/create-demo-fixture.mjs` can reproduce the fixture; the verified rc.2 and final tarballs remain locally ignored release artifacts.

### Release-candidate correction

The first authorized rc.1 attempt stopped before any model call because Harness `0.1.0-rc.6` rejected the standard JSON Schema `minimum` keyword. rc.2 removed that unsupported keyword, added a recursive schema-subset regression test, repacked, reinstalled, and passed no-API boot plus API-backed acceptance. This failed gate is retained in the record because it demonstrates that the live contract check caught a defect not visible to a generic JSON Schema test.

The final promotion changes only package metadata, documentation, tests, and CI configuration; `index.js` and `src/` are unchanged from the API-backed rc.2 artifact. The final archive was nevertheless reinstalled and re-exercised directly as described above.

The v0.1 bundle previously passed installation, composition, activation, and API-backed selection with DeepSeek Harness `0.1.0-rc.6`. That evidence is not substituted for the v1 gates.

## Final-release rule

Tag `v1.0.0` only from the reviewed release commit after its final Windows/Ubuntu matrix passes.
