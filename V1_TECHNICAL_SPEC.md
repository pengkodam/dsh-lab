# Technical Specification — dsh-worktree v1.0

## 1. Baseline and Constraints

- Build on the validated v0.1 implementation and retain the plugin id `dsh-worktree`.
- Preserve compatibility with the pinned Harness contract recorded at release time.
- Remain a dependency-free ESM package unless a dependency is justified in an architecture decision record.
- Use only direct child-process execution. Shell execution is prohibited.
- Register exactly three model-facing tools: `git_worktree_list`, `git_worktree_status`, and `git_worktree_compare`.
- All tools target the common Git repository containing the launch directory captured at plugin initialization.

## 2. Runtime Architecture

```text
Harness loads bundle
  → plugin captures launch directory
  → plugin registers three closed-schema tools
  → tool captures one validated worktree discovery snapshot
  → bounded coordinator runs fixed Git operations
  → pure parsers validate complete machine-readable output
  → canonical JSON is assembled in discovery order
  → native renderer produces bounded model-facing text
```

### Module layout

The implementation should evolve toward:

```text
plugins/dsh-worktree/
├── index.js
├── src/
│   ├── errors.js
│   ├── exec-git.js
│   ├── discover-worktrees.js
│   ├── parse-worktree-porcelain.js
│   ├── inspect-status.js
│   ├── parse-status-v2.js
│   ├── compare-worktrees.js
│   ├── parse-name-status.js
│   ├── schemas.js
│   └── render.js
└── test/
    ├── fixtures/
    ├── unit tests
    └── real-repository integration tests
```

Names may vary during implementation, but process execution, pure parsing, orchestration, schemas, and rendering must remain independently testable.

## 3. Shared Git Execution

### Interface

The shared executor accepts only trusted application inputs:

```js
executeGit({
  cwd,
  args,
  signal,
  timeoutMs,
  maxBuffer,
})
```

Callers construct `args` from module-owned constants plus object IDs already validated from discovery output. The executor is not exported to model-facing code as a generic command facility.

### Required behavior

- Use `execFile('git', args, ...)` with `windowsHide: true`.
- Set `LC_ALL=C` and `GIT_OPTIONAL_LOCKS=0` while preserving the remaining process environment. Disabling optional Git locks is part of the read-only contract, not a caller-controlled option.
- Capture stdout as a `Buffer` when parsing NUL-delimited formats.
- Bound stdout and stderr; sanitize and cap diagnostics at 2,000 characters.
- Map abort, timeout, missing executable, non-repository, and unexpected failures to stable errors.
- Use a 10-second subprocess deadline within each tool’s 15-second Harness deadline unless measured repository fixtures require a documented adjustment.
- Do not retry a command whose output may have changed between attempts.

### Concurrency

Status inspection may run across worktrees with a default concurrency limit of four. The coordinator must:

- stop scheduling when the Harness signal is aborted;
- retain discovery order in the final result;
- enforce an aggregate tool deadline rather than granting a fresh unlimited budget to every worktree; and
- fail the complete call on an unexpected inspection error.

## 4. Discovery Snapshot

Discovery continues to execute:

```text
git worktree list --porcelain -z
```

The existing parser contract is retained. The resulting object is frozen or treated as immutable for the duration of a tool call.

### Validation additions

- Record the repository object-ID width observed in non-null HEAD fields.
- Reject inconsistent HEAD widths within one discovery result.
- Accept SHA-1 and SHA-256 object IDs when Git reports valid lowercase or uppercase hexadecimal values; canonicalize to lowercase only if Git behavior and compatibility tests support it. Otherwise preserve the original value and compare case-insensitively.
- Never infer the primary worktree from its branch name.

## 5. `git_worktree_list`

The v0.1 parameter and output schemas remain unchanged. Internal refactoring must pass all existing tests without changing successful canonical JSON or native text except for separately documented corrections.

## 6. `git_worktree_status`

### Parameters

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

### Git operation

For each inspectable non-bare worktree, execute from the validated worktree path:

```text
git status --porcelain=v2 --branch -z --untracked-files=normal
```

No refresh, fetch, or optional lock-writing command may precede it. The shared executor supplies `GIT_OPTIONAL_LOCKS=0`. Integration tests must still verify that supported Git versions leave index bytes and metadata unchanged; a failing platform blocks the release until the read-only contract is restored or explicitly revised.

### Canonical output

```json
{
  "worktrees": [
    {
      "path": "D:/Projects/demo",
      "head": "0123456789abcdef0123456789abcdef01234567",
      "branch": "feature/example",
      "isMain": false,
      "available": true,
      "unavailableReason": null,
      "clean": false,
      "staged": 1,
      "unstaged": 2,
      "untracked": 1,
      "conflicted": 0,
      "upstream": "origin/feature/example",
      "ahead": 3,
      "behind": 0
    }
  ],
  "remoteStateRefreshed": false
}
```

All fields are required. For an unavailable record, observation-derived scalar fields are `null`, `available` is `false`, and `unavailableReason` is a stable string. Identity fields remain populated from discovery.

### Parser rules

- Parse NUL-delimited porcelain v2 records without line-oriented assumptions.
- Validate the reported branch object ID against the HEAD captured in the discovery snapshot. A mismatch fails the call with `REPOSITORY_CHANGED` rather than returning mixed-snapshot facts.
- Recognize branch headers, ordinary changed entries, renamed/copied entries, unmerged entries, and untracked entries.
- Count one path-level entry once in the most severe applicable category.
- `conflicted` counts unmerged records and is not duplicated into staged or unstaged counts.
- A tracked non-conflict entry may contribute to both staged and unstaged counts when both XY positions are non-dot.
- Ignored entries are not requested and are not counted.
- `clean` is true only when all four change counts are zero.
- Ahead/behind values are nullable when no upstream or branch-ab line is reported.
- Unknown record types fail with `INVALID_GIT_OUTPUT` until explicitly supported; silent omission would under-report local changes.

## 7. `git_worktree_compare`

### Parameters

The tool is zero-argument in v1.0 and therefore uses the same closed empty-object schema as the other tools.

### Comparison baseline

- Baseline identity is the primary discovery record.
- Baseline revision is its full captured HEAD object ID.
- Targets are all later discovery records in order.
- The primary record itself is described once in a top-level `base` object and is not duplicated as a comparison target.
- If the primary record has no comparable HEAD, its identity is still returned and every target is explicitly unavailable with a baseline-specific reason.

### Git operations

For each target with valid base and target HEADs:

1. Count unique commits:

   ```text
   git rev-list --left-right --count BASE...TARGET
   ```

2. Find the merge base:

   ```text
   git merge-base BASE TARGET
   ```

3. When a merge base exists, summarize committed target changes since divergence:

   ```text
   git diff --name-status -z --find-renames MERGE_BASE..TARGET
   ```

`BASE`, `TARGET`, and `MERGE_BASE` are validated full object IDs from Git output. They are passed as separate argv values. No revision expression contains model-provided text.

### Relationship classification

Given `baseOnly` and `targetOnly` counts:

- `identical`: both are zero;
- `ahead`: base-only is zero and target-only is greater than zero;
- `behind`: base-only is greater than zero and target-only is zero;
- `diverged`: both are greater than zero;
- `unrelated`: `git merge-base` reports no common ancestor; or
- `unavailable`: either record cannot be compared.

The implementation must distinguish Git’s documented no-merge-base exit from an unexpected command failure.

### File-summary limits

- Preserve status code and lossless path values in canonical JSON.
- Represent rename/copy source and destination paths separately.
- Cap returned file records at 200 per comparison and set `filesTruncated: true` when more exist.
- Continue parsing the complete bounded subprocess output before returning a truncated record list so malformed trailing output cannot be hidden.
- Keep the subprocess output cap at or below the aggregate response safety budget defined during implementation.

### Canonical output

```json
{
  "base": {
    "path": "D:/Projects/demo",
    "head": "0123456789abcdef0123456789abcdef01234567",
    "branch": "main"
  },
  "comparisons": [
    {
      "path": "D:/Projects/demo-feature",
      "head": "89abcdef0123456789abcdef0123456789abcdef",
      "branch": "feature/example",
      "relationship": "ahead",
      "mergeBase": "0123456789abcdef0123456789abcdef01234567",
      "baseOnlyCommits": 0,
      "targetOnlyCommits": 3,
      "files": [
        {
          "status": "M",
          "path": "src/example.js",
          "sourcePath": null
        }
      ],
      "filesTruncated": false,
      "unavailableReason": null
    }
  ]
}
```

All fields are required. Unavailable or unrelated comparisons use `null` for facts that cannot be established. An unrelated comparison has relationship `unrelated`, not `unavailable`.

## 8. Rendering

### Status renderer

- Start with the total worktree count and clean/dirty/unavailable summary.
- Render one bounded line per worktree in discovery order.
- Show change counts compactly and state that upstream facts are local-only when any upstream data is present.

### Comparison renderer

- Identify the primary baseline path, branch, and abbreviated HEAD.
- Render relationship and unique-commit counts for every target.
- Show bounded changed-file counts rather than full patches.
- Use language such as “review signals” and avoid “safe to merge.”

Control characters in inline paths and reasons are escaped exactly as in the v0.1 renderer.

## 9. Error Model

Reuse `WorktreeError` and the existing stable codes. Add narrowly scoped codes only if implementation reveals distinct recoveries, for example:

- `WORKTREE_UNAVAILABLE` is data, not a top-level error, when discovery proves the record is expected but its path is unavailable.
- `UNSUPPORTED_GIT_VERSION` may be added if feature probing shows the installed Git cannot provide a required machine-readable contract.
- `REPOSITORY_CHANGED` indicates that a discovery identity no longer matches a later observation; its recovery is to retry against a stable repository.
- Malformed status, rev-list, merge-base, or diff output maps to `INVALID_GIT_OUTPUT` with a bounded diagnostic naming the failed contract.

Never expose raw stack traces, complete stderr, environment variables, or partial canonical results.

## 10. Testing Strategy

### Pure parser tests

Cover:

- clean, staged, unstaged, staged-plus-unstaged, untracked, and conflicted status;
- branch with and without upstream and ahead/behind metadata;
- spaces, tabs, newlines, non-ASCII, and rename pairs in paths;
- SHA-1 and, where supported by fixture Git, SHA-256 object IDs;
- identical, ahead, behind, diverged, and unrelated histories;
- truncated file summaries after complete validation;
- unknown or malformed records and non-NUL-terminated output; and
- a status HEAD that differs from the captured discovery HEAD.

### Adapter tests

Verify exact executable, argv, cwd, environment override, timeout, signal, buffer limit, and stable error mapping. No test should merely snapshot a shell string.

### Real-repository integration tests

Create temporary repositories containing:

- primary and multiple linked worktrees;
- clean and dirty combinations;
- staged, unstaged, untracked, renamed, and conflicted paths;
- detached, locked, prunable, and unavailable records where Git permits deterministic fixtures;
- ahead, behind, diverged, identical, and unrelated commit graphs; and
- nested-directory and linked-worktree launch contexts.

Capture read-only invariants before and after each tool call. Tests must clean up their own temporary repositories even after failure. Inject or simulate a concurrent HEAD change and verify `REPOSITORY_CHANGED` rather than mixed-snapshot success.

### Harness acceptance

Validate:

1. local package archive contents;
2. clean-profile install and `--dump-config` composition;
3. no-API boot activation;
4. an API-backed run using the demonstration prompt;
5. accurate answer content against a known fixture; and
6. persisted `tool/call` events naming the invoked tools.

## 11. Packaging and Release

- Update package version according to the chosen prerelease cadence, ending at `1.0.0` only after all acceptance gates pass.
- Add `CHANGELOG.md` with user-visible additions and compatibility notes.
- Ensure `npm pack --dry-run` contains only declared runtime, license, and documentation files.
- Document supported Harness, Node, and Git versions with the validation date.
- Record final evidence in `V1_ACCEPTANCE.md` without secrets, API credentials, or disposable fixture paths that reveal private data.
- Verify the documented install, upgrade, and removal commands against the packaged artifact.
