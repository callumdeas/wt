- [wt](#wt)
    - [Installation](#installation)
    - [Setup](#setup)
    - [Upgrading](#upgrading)
    - [Commands](#commands)
    - [Configuration](#configuration)
    - [Development Guide](#development-guide)
    - [Publishing a New Version](#publishing-a-new-version)

# wt

Git worktree manager for bare-repo workflows. CLI tool that simplifies creating, navigating, and managing git worktrees using a bare-repo structure. Supports per-repo configuration, VS Code/Cursor workspace integration, and batch flags for AI agent use.

## Installation

Via Homebrew (recommended):

```shell
brew tap callumdeas/wt
brew install wt
```

Or via npm:

```shell
npm install -g doubleut
```

## Setup

After installing, run `wt init` to add shell integration to your shell config. This enables `wt cd`, `wt new`, and `wt get` to automatically change into the target worktree directory:

```shell
wt init
source ~/.zshrc
```

This appends a small wrapper function to `~/.zshrc` (idempotent — safe to run multiple times).

## Upgrading

```shell
brew upgrade wt        # if installed via Homebrew
# or
npm install -g doubleut   # if installed via npm

wt init --force
source ~/.zshrc
```

`wt init --force` replaces the shell wrapper function with the latest version. Without `--force`, `wt init` skips the update if the wrapper already exists.

## Commands

### Setup

| Command                | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `wt clone <url> [dir]` | Clone a repo into a bare worktree structure                     |
| `wt convert`           | Convert an existing git clone into a bare worktree repo         |
| `wt config`            | Configure `.worktreerc.json` for the current repo               |
| `wt init [--force]`    | Install shell integration into `~/.zshrc` (`--force` to update) |

### Worktree management

| Command            | Description                                                  |
| ------------------ | ------------------------------------------------------------ |
| `wt new <branch>`  | Create a new worktree from the default branch and cd into it |
| `wt get <pattern>` | Check out an existing branch into a worktree and cd into it  |
| `wt ls`            | List all worktrees with branch info                          |
| `wt rm [name]`     | Remove a worktree (interactive if no name given)             |

### Navigation

| Command          | Description                                                   |
| ---------------- | ------------------------------------------------------------- |
| `wt cd [name]`   | Change directory to a worktree (interactive if no name given) |
| `wt open [name]` | Open a worktree in the configured editor                      |

### Development

| Command     | Description                                              |
| ----------- | -------------------------------------------------------- |
| `wt update` | Merge the latest default branch into the current branch  |
| `wt start`  | Kill process on configured port and start the dev server |

### Workspace

| Command              | Description                                        |
| -------------------- | -------------------------------------------------- |
| `wt workspace sync`  | Rebuild workspace file from all existing worktrees |
| `wt workspace open`  | Open the workspace file in editor                  |
| `wt workspace reset` | Delete the workspace file                          |

### Flags

Some commands accept flags for non-interactive (batch) use:

```shell
wt clone <url> --post-create "npm ci" --editor cursor --workspace-mode --no-install
wt convert --post-create "npm ci" --editor cursor --workspace-mode --no-install
wt convert --port feat/auth feat/payments  # port specific branches as worktrees
wt convert --no-port-branches              # skip branch porting prompt
wt get <pattern> --first       # auto-select first match
wt get <pattern> --exact       # exact branch name match only
wt rm <name> --force --delete-branch
wt config --post-create "npm ci" --editor cursor --workspace-mode
```

Run `wt <command> --help` for full flag details on any command.

## Configuration

Each bare repo has a `.worktreerc.json` at its root:

```json
{
    "postCreate": "npm ci",
    "editor": "cursor",
    "workspaceMode": true,
    "preStart": "lsof -ti:8081 | xargs kill -9 2>/dev/null || true",
    "startCmd": "yarn dev"
}
```

| Field           | Default  | Description                                                           |
| --------------- | -------- | --------------------------------------------------------------------- |
| `postCreate`    | `""`     | Command to run after creating a worktree (e.g. `npm ci`)              |
| `editor`        | `"code"` | Editor command for `wt open` (`code`, `cursor`, `vim`, `nvim`, `zed`) |
| `workspaceMode` | `true`   | Use a shared `.code-workspace` file for multi-root editing            |
| `preStart`      | `""`     | Command to run before `wt start` (e.g. kill a port, clear cache)      |
| `startCmd`      | `""`     | Dev server command for `wt start`                                     |

Legacy `.worktreerc` files (KEY=VALUE format) are auto-migrated to JSON on first use.

### Bare repo structure

```
repo-name/
├── .bare/                      # Bare git repository
├── .worktreerc.json            # Per-repo configuration
├── repo-name.code-workspace    # VS Code/Cursor workspace (if workspaceMode)
├── main/                       # Default branch worktree
├── feature-branch/             # Feature worktree
└── PROJ-123-add-feature/       # Another feature worktree
```

## Development Guide

```shell
git clone git@github.com:CallumDeas/wt.git
cd wt
npm install
npm run build
npm link         # makes 'wt' available globally for testing
```

Run tests:

```shell
npx jest --watchman=false
```

Report bugs, suggest features, or share ideas via [GitHub Issues](https://github.com/CallumDeas/wt/issues).

## Publishing a New Version

Releases are published to npm by tagging a new version on GitHub. All tags follow standard semantic versioning.

> [!WARNING]
> Once your PR is merged to `main`, please check that there are no other PRs being included in the version change.
> If they are please do your due diligence in confirming that these changes are expected to be included with yours.
> Any version bump will include all merged changes between the last version and this new one.

To publish a new version:

1. Navigate to https://github.com/CallumDeas/wt/releases
2. Click `Draft a new release`.
3. Select the `Choose a tag` dropdown and manually enter the desired version number (e.g. `v0.1.0`).
4. Click `Generate release notes` and verify all of the expected changes are included.
5. Click `Publish release` — the release workflow builds and publishes to npm.
