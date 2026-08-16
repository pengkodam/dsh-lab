# dsh-lab

Local experiments for extending [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) without modifying its source tree.

The first bundle is [`dsh-worktree`](./plugins/dsh-worktree/README.md), a read-only worktree-intelligence plugin for the Git repository from which Harness was launched.

## v1 release

`dsh-worktree` 1.0.0 provides three read-only tools: repository-wide discovery, local status, and committed-history comparison against the primary worktree. The release passed its local, packed-artifact, live Harness, and Windows/Ubuntu CI gates.

- [`V1_PRD.md`](./V1_PRD.md) defines the product and demonstration contract.
- [`V1_TECHNICAL_SPEC.md`](./V1_TECHNICAL_SPEC.md) defines the tool schemas, Git operations, safety model, and verification strategy.
- [`V1_RELEASE_CHECKLIST.md`](./V1_RELEASE_CHECKLIST.md) sequences implementation and release gates.
- [`V1_ACCEPTANCE.md`](./V1_ACCEPTANCE.md) records the completed release evidence.

## Repository layout

```text
dsh-lab/
├── PRD — dsh-lab_ Local DeepSeek Harness Worktree Plugin.md
├── V1_PRD.md
├── V1_TECHNICAL_SPEC.md
├── V1_RELEASE_CHECKLIST.md
├── V1_ACCEPTANCE.md
├── README.md
└── plugins/
    └── dsh-worktree/
```

## Quick verification

```powershell
cd plugins/dsh-worktree
node --test
```

Live Harness installation requires a compatible `dsh` CLI. See the plugin README for installation and removal commands.
