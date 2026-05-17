/**
 * E2E tests for `wt repos` and cross-repo `wt cd --repo`.
 *
 * All tests use WT_CONFIG_HOME to isolate registry writes to a temp directory
 * so they never touch the real ~/.config/wt/registry.json.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIT_ENV, RunResult, createRemote, makeTmpDir, runWt } from "./helpers.js";

// Isolated registry dir, shared across the whole suite
const REGISTRY_DIR = realpathSync(mkdtempSync(join(tmpdir(), "wt-e2e-repos-registry-")));

function wtEnv(): NodeJS.ProcessEnv {
    return { ...GIT_ENV, WT_CONFIG_HOME: REGISTRY_DIR };
}

afterAll(() => {
    rmSync(REGISTRY_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let repoA = "";
let repoB = "";
let baseA = "";
let baseB = "";

beforeAll(() => {
    baseA = makeTmpDir("repos-a");
    baseB = makeTmpDir("repos-b");

    const urlA = createRemote(baseA);
    const urlB = createRemote(baseB);

    const cloneA = runWt(["clone", urlA, "repo-a", "--no-config", "--no-install"], { cwd: baseA, env: wtEnv() });
    expect(cloneA.status).toBe(0);
    repoA = join(baseA, "repo-a");

    const cloneB = runWt(["clone", urlB, "repo-b", "--no-config", "--no-install"], { cwd: baseB, env: wtEnv() });
    expect(cloneB.status).toBe(0);
    repoB = join(baseB, "repo-b");
});

afterAll(() => {
    rmSync(baseA, { recursive: true, force: true });
    rmSync(baseB, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// wt clone auto-registers
// ---------------------------------------------------------------------------

describe("wt clone auto-registers", () => {
    it("registers the cloned repo in the registry", () => {
        const result = runWt(["repos", "list"], { cwd: repoA, env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("repo-a");
    });

    it("registers repo-b after its clone", () => {
        const result = runWt(["repos", "list"], { cwd: repoB, env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("repo-b");
    });
});

// ---------------------------------------------------------------------------
// wt repos list
// ---------------------------------------------------------------------------

describe("wt repos list", () => {
    it("shows both registered repos", () => {
        const result = runWt(["repos", "list"], { cwd: repoA, env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("repo-a");
        expect(result.stderr).toContain("repo-b");
    });

    it("marks the current repo with a bullet indicator", () => {
        const result = runWt(["repos", "list"], { cwd: repoA, env: wtEnv() });
        expect(result.stderr).toContain("●");
    });
});

// ---------------------------------------------------------------------------
// wt repos add / rm
// ---------------------------------------------------------------------------

describe("wt repos add", () => {
    it("registers a path that has a .bare", () => {
        const result = runWt(["repos", "add", repoA], { cwd: baseA, env: wtEnv() });
        expect(result.status).toBe(0);
        // idempotent — already registered, but shouldn't error
    });

    it("fails on a path without .bare", () => {
        const result = runWt(["repos", "add", baseA], { cwd: baseA, env: wtEnv() });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Not a wt-managed repository");
    });
});

describe("wt repos rm", () => {
    it("removes by name with --yes", () => {
        // Register a throwaway repo
        const tmpBase = makeTmpDir("repos-rm");
        const url = createRemote(tmpBase);
        runWt(["clone", url, "to-remove", "--no-config", "--no-install"], { cwd: tmpBase, env: wtEnv() });
        const target = join(tmpBase, "to-remove");

        const rmResult = runWt(["repos", "rm", "--yes", "to-remove"], { cwd: target, env: wtEnv() });
        expect(rmResult.status).toBe(0);
        expect(rmResult.stderr).toContain("Removed");

        const listResult = runWt(["repos", "list"], { cwd: target, env: wtEnv() });
        expect(listResult.stderr).not.toContain("to-remove");

        rmSync(tmpBase, { recursive: true, force: true });
    });

    it("fails for an unknown repo", () => {
        const result = runWt(["repos", "rm", "--yes", "does-not-exist"], { cwd: repoA, env: wtEnv() });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Not found in registry");
    });
});

// ---------------------------------------------------------------------------
// wt cd --repo (non-interactive)
// ---------------------------------------------------------------------------

describe("wt cd --repo <name> <worktree>", () => {
    it("outputs the correct path to stdout", () => {
        const result: RunResult = runWt(["cd", "--repo", "repo-a", "main"], { cwd: baseA, env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(join(repoA, "main"));
    });

    it("works from a directory outside any bare repo", () => {
        const result: RunResult = runWt(["cd", "--repo", "repo-b", "main"], { cwd: tmpdir(), env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(join(repoB, "main"));
    });

    it("errors for an unknown --repo value", () => {
        const result = runWt(["cd", "--repo", "nonexistent", "main"], { cwd: baseA, env: wtEnv() });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Unknown repo");
    });

    it("errors when worktree name does not exist in target repo", () => {
        const result = runWt(["cd", "--repo", "repo-a", "no-such-branch"], { cwd: baseA, env: wtEnv() });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Worktree not found");
    });
});
