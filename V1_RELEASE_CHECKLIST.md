# dsh-worktree v1.0 Release Checklist

## Build Preferences

- **Build mode:** Autonomous implementation with explicit verification gates
- **Scope:** Read-only worktree intelligence
- **Git cadence:** One intentional commit per completed vertical capability when a Git repository is available
- **Verification:** Run targeted tests after every item and the complete suite at integration gates
- **Compatibility:** Preserve the v0.1 `git_worktree_list` successful contract

## Checklist

- [x] **1. Lock the v1 product contract**
  Spec ref: `V1_PRD.md > Release Narrative` and `V1_PRD.md > Functional Requirements`
  What to build: Define the demonstration prompt, user journeys, tool boundaries, explicit non-goals, and release acceptance criteria.
  Acceptance: The release has one coherent read-only story and does not imply merge safety or include mutating features.
  Verify: Review `V1_PRD.md` against the original v0.1 PRD and confirm every added capability has a measurable acceptance condition.

- [x] **2. Specify the runtime and data contracts**
  Spec ref: `V1_TECHNICAL_SPEC.md > Runtime Architecture` through `V1_TECHNICAL_SPEC.md > Error Model`
  What to build: Define tool schemas, fixed Git operations, parsing rules, concurrency, limits, rendering, and error behavior before runtime edits.
  Acceptance: The implementation can proceed without inventing model inputs, comparison semantics, partial-success behavior, or safety limits.
  Verify: Cross-check every v1 PRD functional requirement against at least one technical-spec section and checklist item.

- [x] **3. Extract and harden shared Git execution**
  Spec ref: `V1_TECHNICAL_SPEC.md > Shared Git Execution`
  What to build: Refactor the existing adapter into a reusable fixed-command executor while preserving discovery behavior and error mapping.
  Acceptance: No generic model-controlled command surface exists; cancellation, timeout, locale, optional-lock suppression, buffers, and diagnostics remain bounded.
  Verify: Run `node --test test/git-adapter.test.js test/plugin.test.js` from `plugins/dsh-worktree` and inspect exact argv and environment assertions.

- [x] **4. Preserve and strengthen discovery**
  Spec ref: `V1_TECHNICAL_SPEC.md > Discovery Snapshot` and `V1_TECHNICAL_SPEC.md > git_worktree_list`
  What to build: Move discovery behind the shared executor, validate object IDs, and keep the v0.1 canonical contract stable.
  Acceptance: All existing discovery fixtures and integrations pass unchanged; inconsistent or malformed object IDs fail explicitly.
  Verify: Run the existing suite plus new SHA-1, SHA-256-compatible, malformed-ID, root, nested, and linked-worktree cases.

- [x] **5. Implement porcelain-v2 status parsing**
  Spec ref: `V1_TECHNICAL_SPEC.md > git_worktree_status > Parser rules`
  What to build: Add a pure NUL-delimited parser for branch headers and tracked, renamed, unmerged, and untracked entries.
  Acceptance: Counts and nullable upstream facts match the v1 schema for every specified record combination and unusual path fixture; a changed HEAD fails with `REPOSITORY_CHANGED`.
  Verify: Run targeted status-parser tests including malformed and non-NUL-terminated output.

- [x] **6. Register and integrate `git_worktree_status`**
  Spec ref: `V1_TECHNICAL_SPEC.md > git_worktree_status` and `V1_PRD.md > FR-3 — Repository-wide status`
  What to build: Inspect every discovered worktree with bounded concurrency, return results in discovery order, and add native rendering.
  Acceptance: Clean, dirty, bare, missing/prunable, detached, upstream, and conflict cases are explicit; no remote command runs.
  Verify: Run real-repository status integration tests and compare refs, index, worktree content, and configuration before and after.

- [x] **7. Implement committed-history comparison**
  Spec ref: `V1_TECHNICAL_SPEC.md > git_worktree_compare`
  What to build: Add unique-commit, merge-base, relationship, and bounded name-status parsing for every non-primary worktree.
  Acceptance: Identical, ahead, behind, diverged, unrelated, detached, and unavailable targets produce schema-valid canonical results.
  Verify: Run pure comparison tests and real commit-graph integration fixtures; assert exact executable argv and truncation behavior.

- [x] **8. Register and render `git_worktree_compare`**
  Spec ref: `V1_TECHNICAL_SPEC.md > Rendering` and `V1_PRD.md > FR-4 — Primary-worktree comparison`
  What to build: Register the closed-schema zero-argument tool and render concise relationship and changed-file summaries.
  Acceptance: The renderer identifies its primary baseline, never returns full patches, escapes control characters, and avoids merge-safety claims.
  Verify: Run schema, plugin-registration, and renderer tests, then inspect representative output manually.

- [ ] **9. Prove repository-wide safety and portability**
  Spec ref: `V1_PRD.md > FR-7 — Read-only proof` and `V1_TECHNICAL_SPEC.md > Testing Strategy`
  What to build: Expand real-repository fixtures, read-only snapshots, aggregate cancellation tests, and multi-platform CI.
  Acceptance: The complete suite passes on supported Node versions on Windows and at least one Unix-like environment with no Git-state mutation.
  Verify: Run `node --test`, CI, fixture cleanup checks, and before/after invariant comparisons.

- [x] **10. Validate the Harness demonstration**
  Spec ref: `V1_PRD.md > Release Narrative` and `V1_TECHNICAL_SPEC.md > Harness acceptance`
  What to build: Install the packed prerelease into an isolated profile and run the canonical demonstration against a known repository fixture.
  Acceptance: Harness selects the dedicated tools, reports accurate facts, records the tool calls, and boots cleanly without API access.
  Verify: Run `node scripts/accept-plugin.mjs <installed-plugin-index.js>`, then save sanitized `--dump-config`, no-API smoke, API-backed answer, fixture expectation, and session-audit evidence in `V1_ACCEPTANCE.md`.

  Result: rc.2 passed packed install, composition, no-API boot, direct installed-tool acceptance, API-backed execution, persisted three-tool audit, and uninstall verification against a generated fixture.

- [ ] **11. Finish the releasable package**
  Spec ref: `V1_TECHNICAL_SPEC.md > Packaging and Release` and `V1_PRD.md > Release Acceptance`
  What to build: Complete versioning, changelog, compatibility table, install/upgrade/remove docs, package contents, and final acceptance record.
  Acceptance: A new user can reproduce installation and the demo from the README; all release gates pass against the packed artifact.
  Verify: Run the complete test suite, `npm pack --dry-run`, packaged install/upgrade/uninstall checks, and a documentation command audit before tagging `v1.0.0`.

## Release Gate

Do not tag `v1.0.0` while any checklist item is incomplete, an acceptance result depends on an unpackaged source checkout, or the read-only invariant is unresolved on a supported platform.
