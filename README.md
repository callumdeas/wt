| Pipeline       | Status |
|---------------|------------------------------------------------------------------------------------------------------------|
| [build](https://buildkite.com/fanduel/wt-build) | [![Build status](https://badge.buildkite.com/8ac6556be2e63cb34fc4b4045dad426faf9907e3726d486f60.svg)](https://buildkite.com/fanduel/wt-build) |

- [@fanduel/wt](#fanduelwt)
    - [Installation](#installation)
    - [Development Guide](#development-guide)
    - [Publishing a New Version](#publishing-a-new-version)

# @fanduel/wt

Git worktree manager for bare-repo workflows. CLI tool that simplifies creating, navigating, and managing git worktrees using a   bare-repo structure. Supports per-repo configuration, VS Code/Cursor workspace integration, and batch flags for AI agent use.

## Installation

> [!IMPORTANT]
> Access to FanDuel's Artifactory package registry is required.

```shell
npm install @fanduel/wt
```

## Development Guide

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