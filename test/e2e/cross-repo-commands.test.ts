/**
 * E2E tests for cross-repo support added to `wt ls` and `wt rm`.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIT_ENV, createRemote, makeTmpDir, runGit, runWt } from "./helpers.js";

const REGISTRY_DIR = realpathSync(mkdtempSync(join(tmpdir(), "wt-e2e-crosscmd-registry-")));

function wtEnv(): NodeJS.ProcessEnv {
    return { ...GIT_ENV, WT_CONFIG_HOME: REGISTRY_DIR };
}

let repoA = "";
let baseA = "";
let baseB = "";

beforeAll(() => {
    baseA = makeTmpDir("crosscmd-a");
    baseB = makeTmpDir("crosscmd-b");

    const cloneA = runWt(["clone", createRemote(baseA), "repo-a", "--no-config", "--no-install"], {
        cwd: baseA,
        env: wtEnv(),
    });
    expect(cloneA.status).toBe(0);
    repoA = join(baseA, "repo-a");

    const cloneB = runWt(["clone", createRemote(baseB), "repo-b", "--no-config", "--no-install"], {
        cwd: baseB,
        env: wtEnv(),
    });
    expect(cloneB.status).toBe(0);
    // repo-b only needs to exist in the registry; its path is referenced by name.
});

afterAll(() => {
    rmSync(REGISTRY_DIR, { recursive: true, force: true });
    rmSync(baseA, { recursive: true, force: true });
    rmSync(baseB, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// wt ls --repo
// ---------------------------------------------------------------------------

describe("wt ls --repo <name>", () => {
    it("lists worktrees for the named repo", () => {
        const result = runWt(["ls", "--repo", "repo-a"], { cwd: baseA, env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("repo-a");
        expect(result.stderr).toContain("main");
    });

    it("works from a directory outside any bare repo", () => {
        const result = runWt(["ls", "--repo", "repo-b"], { cwd: tmpdir(), env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("repo-b");
        expect(result.stderr).toContain("main");
    });

    it("errors for an unknown repo", () => {
        const result = runWt(["ls", "--repo", "nonexistent"], { cwd: baseA, env: wtEnv() });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Unknown repo");
    });
});

// ---------------------------------------------------------------------------
// wt ls --all
// ---------------------------------------------------------------------------

describe("wt ls --all", () => {
    it("lists worktrees for all registered repos", () => {
        const result = runWt(["ls", "--all"], { cwd: baseA, env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("repo-a");
        expect(result.stderr).toContain("repo-b");
    });

    it("shows worktree names under each repo header", () => {
        const result = runWt(["ls", "--all"], { cwd: baseA, env: wtEnv() });
        // Both repos have a 'main' worktree from the clone
        expect(result.stderr.match(/main/g)?.length).toBeGreaterThanOrEqual(2);
    });
});

// ---------------------------------------------------------------------------
// wt rm --repo (non-interactive)
// ---------------------------------------------------------------------------

describe("wt rm --repo <name> <worktree>", () => {
    const worktreePath = () => join(repoA, "rm-test-feature");
    const bareDir = () => join(repoA, ".bare");

    beforeEach(() => {
        // Create branch from main explicitly (bare repo HEAD may point to a non-existent ref)
        runGit(["branch", "rm-test-feature", "main"], bareDir());
        runGit(["worktree", "add", worktreePath(), "rm-test-feature"], bareDir());
    });

    afterEach(() => {
        // Best-effort cleanup: remove worktree + branch in case the test left them behind
        try {
            runGit(["worktree", "remove", "--force", worktreePath()], bareDir());
        } catch {
            // already removed by the command under test
        }
        try {
            runGit(["branch", "-D", "rm-test-feature"], bareDir());
        } catch {
            // already deleted or never existed
        }
    });

    it("removes a worktree from the named repo", () => {
        const result = runWt(["rm", "rm-test-feature", "--repo", "repo-a", "--keep-branch", "--force"], {
            cwd: baseA,
            env: wtEnv(),
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("Worktree removed");
    });

    it("works from a directory outside any bare repo", () => {
        const result = runWt(["rm", "rm-test-feature", "--repo", "repo-a", "--keep-branch", "--force"], {
            cwd: tmpdir(),
            env: wtEnv(),
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("Worktree removed");
    });

    it("errors for an unknown --repo value", () => {
        const result = runWt(["rm", "rm-test-feature", "--repo", "nonexistent", "--keep-branch", "--force"], {
            cwd: baseA,
            env: wtEnv(),
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Unknown repo");
    });

    it("errors when worktree name does not exist in target repo", () => {
        const result = runWt(["rm", "no-such-worktree", "--repo", "repo-a", "--keep-branch", "--force"], {
            cwd: baseA,
            env: wtEnv(),
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Worktree not found");
    });
});
