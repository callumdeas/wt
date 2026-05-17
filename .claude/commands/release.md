# Release `wt`

Follow these steps in order to publish a new version of the `doubleut` (`wt`) CLI.

## Repo context (read this first)

- GitHub: https://github.com/callumdeas/wt
- Tag format: `vX.Y.Z`
- `package.json` always has `"version": "0.0.0"` locally — the CI sets the real version from the tag at publish time, so never bump package.json manually
- The Release GitHub Actions workflow is triggered automatically when a release is **published**. It runs: lint → build → tests → `npm publish` → Homebrew formula bump

---

## Step 1 — Determine the next version

```bash
gh release list --limit 3
```

Parse the latest tag (e.g. `v0.3.1`) and show the user these options:

| Choice | Example result          |
| ------ | ----------------------- |
| patch  | v0.3.1 → **v0.3.2**     |
| minor  | v0.3.1 → **v0.4.0**     |
| major  | v0.3.1 → **v1.0.0**     |
| custom | user types the full tag |

Ask which they want. Compute and display the resulting tag, then ask for explicit confirmation (`Y/n`) before continuing.

---

## Step 2 — Verify repo state

Run both checks:

```bash
git status
git log origin/main..HEAD --oneline
```

- **Uncommitted changes**: warn the user. The release tags whatever is on `origin/main`, so local-only changes won't be included. Confirm they want to continue.
- **Unpushed commits**: stop here. Tell the user to push first — the release workflow runs against `origin/main`.
- **Clean and synced**: proceed silently.

---

## Step 3 — Draft release notes

Auto-generate a first draft from commits since the previous tag:

```bash
# get the previous tag
PREV_TAG=$(gh release list --limit 1 --json tagName --jq '.[0].tagName')
git log "${PREV_TAG}..HEAD" --pretty=format:"- %s" --no-merges
```

Present the draft to the user and ask:

> "Use these notes, edit them, or write from scratch?"

Shape the final notes into sections that make sense for what changed — for example:

```
## Fixes
- ...

## Features
- ...
```

Skip empty sections. If a single line covers everything, a flat bullet list without headers is fine.

---

## Step 4 — Create the GitHub release

```bash
gh release create <tag> --title "<tag>" --notes "<notes>"
```

Confirm the URL printed by `gh` and tell the user the Release workflow has been triggered.

---

## Step 5 — Monitor CI

Begin polling immediately after the release is created. The run to watch is the **Release** workflow triggered by `release` event on the new tag.

Poll loop — run this every ~30 seconds and report status each cycle:

```bash
gh run list --limit 10 --json databaseId,displayTitle,status,conclusion,workflowName,event,createdAt \
  --jq '.[] | select(.workflowName == "Release")'
```

For each cycle, show:

- Workflow name, run ID, status, elapsed time
- A one-line summary of any steps that have completed

Continue until the Release run reaches a terminal state (`completed`, `failure`, `cancelled`).

### On success

Print a brief summary:

```
✓ Release <tag> published
  npm: doubleut@<version>  https://www.npmjs.com/package/doubleut
  Homebrew: formula bump committed to callumdeas/homebrew-wt
  GitHub release: https://github.com/callumdeas/wt/releases/tag/<tag>
```

### On failure

Fetch the failure details:

```bash
gh run view <run-id> --log-failed
```

Read the logs carefully and diagnose. Common failure modes and fixes:

**Lint / format failure**

- Fix: `npm run format`, then commit and push the formatted files.
- Note: the workflow cannot be re-run in place because it ran against the tag commit, not `main`. You must delete the release and re-release after fixing:
    ```bash
    gh release delete <tag> --yes
    git push origin --delete <tag>
    ```
    Then restart from Step 4 with the same tag.

**Build / type-check failure**

- Fix: resolve the TypeScript errors (`npm run build` to reproduce), commit, push, delete release + tag, re-release.

**Test failure**

- Fix: reproduce locally (`npx jest --watchman=false <failing-test-file>`), fix the code, commit, push, delete release + tag, re-release.

**npm publish failure (`E403` / auth)**

- The `NPM_TOKEN` secret may be expired or missing. Advise the user to check Settings → Secrets → `NPM_TOKEN` in the GitHub repo. No code change needed — once the secret is fixed, delete the release + tag and re-release.

**Homebrew formula bump failure**

- The bump step retries internally (up to 12 × 10 s). If it still fails, the npm publish has already succeeded — only the Homebrew formula is stale. Check the tap repo (`callumdeas/homebrew-wt`) and update `Formula/wt.rb` manually if needed.

After diagnosing, give the user a clear, ordered action plan. If the fix requires code changes, make them and offer to run the full release flow again from Step 2.
