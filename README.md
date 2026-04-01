| Pipeline                                        | Status                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [build](https://buildkite.com/fanduel/wt-build) | [![Build status](https://badge.buildkite.com/8ac6556be2e63cb34fc4b4045dad426faf9907e3726d486f60.svg)](https://buildkite.com/fanduel/wt-build) |

- [@fanduel/wt](#fanduelwt)
    - [Installation](#installation)
    - [Setup](#setup)
    - [Commands](#commands)
    - [Configuration](#configuration)
    - [Development Guide](#development-guide)
    - [Publishing a New Version](#publishing-a-new-version)

# @fanduel/wt

Git worktree manager for bare-repo workflows. CLI tool that simplifies creating, navigating, and managing git worktrees using a bare-repo structure. Supports per-repo configuration, VS Code/Cursor workspace integration, and batch flags for AI agent use.

## Installation

> [!IMPORTANT]
> Access to FanDuel's Artifactory package registry is required. See the [JFrog Registry Setup guide](https://fanduel.atlassian.net/wiki/spaces/AWDW/pages/308181204994/FanDuel+JFrog+Registry+Setup) if you haven't configured this before.

```shell
npm install -g @fanduel/wt
```

If you don't have the FanDuel registry configured globally, add it to `~/.npmrc`:

```shell
printf '@fanduel:registry=https://fanduel.pe.jfrog.io/artifactory/api/npm/fd-npm/\n//fanduel.pe.jfrog.io/artifactory/api/npm/fd-npm/:email=${FD_NPM_USERNAME}\n//fanduel.pe.jfrog.io/artifactory/api/npm/fd-npm/:_auth=${FD_NPM_AUTH_TOKEN}\n' >> ~/.npmrc
```

## Setup

After installing, run `wt init` to add shell integration to your shell config. This enables `wt cd` to change directories:

```shell
wt init
source ~/.zshrc
```

This appends a small wrapper function to `~/.zshrc` (idempotent — safe to run multiple times).

## Commands

### Setup

| Command                | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `wt clone <url> [dir]` | Clone a repo into a bare worktree structure       |
| `wt config`            | Configure `.worktreerc.json` for the current repo |
| `wt init`              | Install shell integration into `~/.zshrc`         |

### Worktree management

| Command            | Description                                                     |
| ------------------ | --------------------------------------------------------------- |
| `wt new <branch>`  | Create a new worktree with a new branch from the default branch |
| `wt get <pattern>` | Check out an existing remote branch into a worktree             |
| `wt ls`            | List all worktrees with branch info                             |
| `wt rm [name]`     | Remove a worktree (interactive if no name given)                |

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
├── WIZ-123/                    # Feature worktree
└── WIZ-456-add-feature/        # Another feature worktree
```

## Development Guide

```shell
git clone git@github.com:fanduel/wt.git
cd wt
npm install
npm run build
npm link         # makes 'wt' available globally for testing
```

Run tests:

```shell
npx jest --watchman=false
```

## Publishing a New Version

The buildkite pipeline is set to only run the publish step when a new tag is created in github for the repo.

All tags are expected to follow standard semantic versioning practices.

> [!WARNING]
> Once your PR is merged to `main`, please check that there are no other PRs being included in the version change.
> If they are please do your due diligence in confirming that these changes are expected to be included with yours.
> Any version bump will include all merged changes between the last version and this new one.

To publish a new version, please follow these steps:

1. Navigate to https://github.com/fanduel/wt/releases
2. Click `Draft a new release`.
3. Select the `Choose a tag` dropdown and manually enter the desired version number.
4. Click `Generate release notes` and verify all of the expected changes are included within this version.
5. Click `Publish release` and follow the desired run in [buildkite](https://buildkite.com/fanduel/wt-build)
