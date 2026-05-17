/**
 * E2E tests for `wt clean`.
 *
 * Since tests use a file:// remote, the `gh` CLI finds no GitHub PRs and
 * mergedPRsForRepo returns an empty map. Tests therefore cover the command's
 * error paths, the "no candidates" info path, and flag validation rather than
 * actual PR-driven removal (which is exercised by the worktree-remove unit tests).
 *
 * All tests use WT_CONFIG_HOME to isolate registry writes.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIT_ENV, createRemote, makeTmpDir, runWt } from "./helpers.js";

const REGISTRY_DIR = realpathSync(mkdtempSync(join(tmpdir(), "wt-e2e-clean-registry-")));

function wtEnv(): NodeJS.ProcessEnv {
    return { ...GIT_ENV, WT_CONFIG_HOME: REGISTRY_DIR };
}

let repoRoot = "";
let baseDir = "";

beforeAll(() => {
    baseDir = makeTmpDir("clean");
    const url = createRemote(baseDir);

    const clone = runWt(["clone", url, "test-repo", "--no-config", "--no-install"], {
        cwd: baseDir,
        env: wtEnv(),
    });
    if (clone.status !== 0) throw new Error(`beforeAll clone failed:\n${clone.stderr}`);
    repoRoot = join(baseDir, "test-repo");
});

afterAll(() => {
    rmSync(REGISTRY_DIR, { recursive: true, force: true });
    rmSync(baseDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("wt clean — error cases", () => {
    it("exits 1 with no repos available (empty registry, outside any wt repo)", () => {
        const emptyRegistry = realpathSync(mkdtempSync(join(tmpdir(), "wt-e2e-clean-empty-")));
        try {
            const result = runWt(["clean", "--all", "--yes"], {
                cwd: tmpdir(),
                env: { ...GIT_ENV, WT_CONFIG_HOME: emptyRegistry },
            });
            expect(result.status).toBe(1);
            expect(result.stderr).toContain("No wt-managed repos available");
        } finally {
            rmSync(emptyRegistry, { recursive: true, force: true });
        }
    });

    it("exits 1 for an unknown --repo value", () => {
        const result = runWt(["clean", "--repo", "nonexistent", "--all", "--yes"], {
            cwd: repoRoot,
            env: wtEnv(),
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Unknown repo");
    });
});

// ---------------------------------------------------------------------------
// No merged PRs detected (file:// remote has no GitHub PRs)
// ---------------------------------------------------------------------------

describe("wt clean — no merged PRs", () => {
    it("reports no merged worktrees and exits 0", () => {
        const result = runWt(["clean", "--all", "--yes"], { cwd: repoRoot, env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("No merged worktrees found");
    });

    it("--repo <name> limits the scan to the named repo", () => {
        const result = runWt(["clean", "--repo", "test-repo", "--all", "--yes"], {
            cwd: repoRoot,
            env: wtEnv(),
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("No merged worktrees found");
    });

    it("--dry-run exits 0 with no candidates when no merged PRs exist", () => {
        const result = runWt(["clean", "--all", "--yes", "--dry-run"], {
            cwd: repoRoot,
            env: wtEnv(),
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("No merged worktrees found");
    });

    it("uses current repo ad-hoc when it is wt-managed but not in the registry", () => {
        const freshRegistry = realpathSync(mkdtempSync(join(tmpdir(), "wt-e2e-clean-fresh-")));
        try {
            const result = runWt(["clean", "--all", "--yes"], {
                cwd: repoRoot,
                env: { ...GIT_ENV, WT_CONFIG_HOME: freshRegistry },
            });
            expect(result.status).toBe(0);
            expect(result.stderr).toContain("ad-hoc");
        } finally {
            rmSync(freshRegistry, { recursive: true, force: true });
        }
    });
});
