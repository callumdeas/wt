# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`doubleut` — a TypeScript CLI (binary: `wt`) for managing git worktrees in a bare-repo workflow. Built with Commander.js, published as an ESM-only Node.js package (>=22).

## Commands

```shell
npm run build          # compile TS → dist/ (rm -rf dist/* && tsc)
npm run test           # jest
npm run lint           # prettier --check + eslint
npm run format         # prettier --write
npm run link           # build + npm link for local testing
npx jest --watchman=false test/lib/config.test.ts   # single test file
```

## Architecture

### stdout is IPC, stderr is UI

**Critical convention**: all user-facing output goes to **stderr** via `src/lib/output.ts` (`error()`, `success()`, `warn()`, `info()`, `dim()`, `plain()`, `blank()`). **stdout is reserved** as a shell IPC channel — commands like `cd`, `new`, `get` write a directory path to stdout so the shell wrapper function (installed by `wt init`) can capture it and `cd` into the worktree. Never use `console.log()` for diagnostic output.

### Command registration pattern

Each command lives in `src/commands/<name>.ts` and exports a `register<Name>(program: Command)` function. All commands are registered in `src/cli.ts`. Commands that should trigger a directory change write the path to stdout; all others communicate only via stderr.

### Core libraries (`src/lib/`)

- **`git.ts`** — wraps git operations against the `.bare/` directory (worktree CRUD, branch operations, fetch, push, merge)
- **`config.ts`** — loads/saves `.worktreerc.json`, auto-migrates legacy `.worktreerc` (KEY=VALUE) format, interactive config wizard
- **`root.ts`** — walks up from cwd looking for `.bare/` to find the repo root; `requireRoot()` throws if not found
- **`workspace.ts`** — manages the `.code-workspace` file (add/remove/sync folders)
- **`background.ts`** — spawns fully detached processes for post-create hooks, with macOS notifications on completion
- **`output.ts`** — color-coded stderr output via picocolors; exports `pc` for custom styling

### Interactive prompts (`src/lib/prompt.ts`)

Wraps `@inquirer/prompts` with Escape-key cancellation support. All prompts (`select`, `confirm`, `checkbox`, `input`) use this module — never import inquirer directly. Use `promptTheme` (exported from `output.ts`) to keep prompt styling consistent with the CLI's color scheme. On Escape, prompts emit `AbortPromptError`; on Ctrl+C, `ExitPromptError` — both are caught centrally in `cli.ts`.

### Exit codes

- `process.exit(1)` — validation or execution errors
- `process.exitCode = 0` — graceful prompt cancellation (Escape key)
- `process.exitCode = 130` — Ctrl+C (POSIX 128 + SIGINT)

### Testing

Tests split into two layers:

- **`test/lib/`** — unit tests for individual `src/lib/` modules
- **`test/e2e/`** — end-to-end tests that spawn the actual CLI binary

E2E tests share a `test/e2e/helpers.ts` with: `runWt()` (spawns CLI, captures stdout/stderr), `runGit()`, `createRemote()`, `makeTmpDir()`. All tests use a `GIT_ENV` object that sets a fixed git identity, suppresses system git config, and sets `NO_COLOR=1` for deterministic output. Lifecycle/workflow E2E tests are **ordered and stateful by design** — they intentionally cascade failures to model real multi-step workflows.

Jest runs in ESM mode via `ts-jest`; module mapping rewrites `.js` imports back to `.ts` source files. Run a single file with:

```shell
npx jest --watchman=false test/e2e/new.test.ts
```

### Bare repo structure

```
repo-name/
├── .bare/                    # bare git repository
├── .worktreerc.json          # per-repo config (postCreate, editor, workspaceMode, preStart, startCmd)
├── repo-name.code-workspace  # VS Code/Cursor workspace (if workspaceMode enabled)
├── main/                     # default branch worktree
└── feature-branch/           # feature worktrees
```

## Conventions

- **ESM-only**: all imports use `.js` extensions (even for `.ts` source files), module: `"NodeNext"`
- **Kebab-case filenames**: enforced by eslint-plugin-unicorn
- **4-space indentation, 120 char width**: prettier config in package.json
- **Pre-commit hooks** (husky + lint-staged): eslint, tsc type-check, prettier on staged files
- **Idempotent operations**: workspace add skips duplicates, config migration only runs once, `wt init --force` replaces old shell wrapper
- **Background post-create**: `wt new` and `wt get` run postCreate in background (detached, logged to file) so the user gets their shell back immediately. Non-interactive sessions (no TTY on stdin) automatically run in foreground, so AI agents and CI get correct behavior without needing `--foreground`. The flag still exists for humans who want synchronous execution in a terminal
- **AI-agent friendly**: every interactive prompt (confirm, select, input) **must** have a CLI flag or positional argument that bypasses it, so the command can be driven non-interactively by scripts and AI agents. Use the three-way pattern where appropriate: `--flag` to opt-in, `--no-flag` to opt-out, omit to prompt interactively (see `--install / --no-install` in `postSetupFlow` for the reference implementation). Ensure `--help` output gives clear guidance for non-interactive/agent usage
