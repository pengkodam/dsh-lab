# Technical Specification — dsh-worktree v0.1

## Baseline

- DeepSeek Harness contract: `0.1.0-rc.6`, installed and smoke-tested on 2026-08-14.
- Harness runtime requirement: Node `^22.19.0 || >=24.0.0`.
- Local automated-test baseline: Node `22.17.0`, pnpm `11.19.0`, Git `2.39.1.windows.1`.
- Live Harness profile installation, composition, no-API boot activation, and API-backed model tool selection have been validated with `dsh 0.1.0-rc.6`.

## Package shape

`plugins/dsh-worktree` is a dependency-free ESM package and a Harness bundle. Its `package.json` declares `dsh.bundle.patch`; `cordis.patch.yml` inserts the package's plugin entry into a profile.

The runtime uses the raw `ctx.tools.register()` contract rather than importing Harness implementation packages. This keeps the checkout independently testable and avoids coupling the package to Harness's internal dependency graph.

## Runtime flow

```text
Harness loads bundle
  → plugin captures process.cwd()
  → plugin registers git_worktree_list
  → model calls zero-argument tool
  → adapter executes fixed argv: git worktree list --porcelain -z
  → parser validates the complete NUL-delimited result
  → canonical JSON is returned
  → native presentation renders a concise summary
```

## Module responsibilities

- `index.js`: Harness lifecycle, tool schema, canonical output declaration.
- `src/git-adapter.js`: bounded subprocess execution, cancellation, timeout, error mapping.
- `src/parse-porcelain.js`: pure NUL-delimited parser and contract validation.
- `src/render.js`: model-facing native text derived from canonical JSON.
- `src/errors.js`: stable error codes and bounded diagnostics.

## Key decisions

- The tool has no parameters. The model cannot select a different executable, repository, path, or Git argument.
- The Harness launch directory is captured once at plugin module initialization.
- Git is executed directly through `execFile` with a fixed argv array and no shell.
- Git runs with `LC_ALL=C` so fixed diagnostic classification does not depend on the user's locale.
- Output is capped at 1 MiB; diagnostics are capped at 2,000 characters.
- The adapter deadline is 10 seconds, inside the Harness tool deadline of 15 seconds.
- Unknown porcelain attributes are ignored, but malformed record boundaries and required fields fail the whole result.
- Canonical paths and reasons remain lossless; only the native text renderer escapes embedded line breaks and tabs.
- The first Git record is marked as the main worktree, matching Git's documented ordering.
- Parser and integration tests use only Node's standard library.

## Validation status

The package structure, profile installation, `--dump-config`, runtime activation, canonical result, and API-backed `git_worktree_list` model call are validated. The session audit confirmed a persisted `tool/call` event. Uninstall remains documented but was not run because the verified `lab` and `lab-headless` profiles are retained for continued use. See `ACCEPTANCE.md` for the evidence summary.
