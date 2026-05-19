import { rmSync } from "node:fs";
import { join } from "node:path";
import { GIT_ENV, createRemote, makeTmpDir, runGit, runWt } from "./helpers.js";

describe("wt ls", () => {
    let baseDir = "";
    let repoDir = "";
    let env: NodeJS.ProcessEnv;

    beforeEach(() => {
        baseDir = makeTmpDir("ls");
        env = { ...GIT_ENV, WT_CONFIG_HOME: join(baseDir, "config") };
        const clone = runWt(["clone", createRemote(baseDir), "repo", "--no-config", "--no-install"], {
            cwd: baseDir,
            env,
        });
        expect(clone.status).toBe(0);
        repoDir = join(baseDir, "repo");
    });

    afterEach(() => {
        rmSync(baseDir, { recursive: true, force: true });
    });

    it("lists worktrees from inside the repo", () => {
        const result = runWt(["ls"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("repo");
        expect(result.stderr).toContain("main");
    });

    it("shows branch names", () => {
        const result = runWt(["ls"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(0);
        // Branch name should appear alongside the worktree name
        const lines = result.stderr.split("\n");
        expect(lines.some((l) => l.includes("main"))).toBe(true);
    });

    it("marks the current worktree with a bullet", () => {
        const result = runWt(["ls"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(0);
        // The current-directory indicator (●) should appear
        expect(result.stderr).toContain("●");
    });

    it("does not mark the current worktree when run from outside the repo", () => {
        const result = runWt(["ls", "--repo", "repo"], { cwd: baseDir, env });
        expect(result.status).toBe(0);
        // No active-directory bullet when not inside the repo
        expect(result.stderr).not.toContain("●");
    });

    it("errors when not in a repo and no --repo given", () => {
        const result = runWt(["ls"], { cwd: baseDir, env });
        expect(result.status).toBe(1);
    });

    it("shows additional worktrees after wt new", () => {
        runGit(["fetch", "--all"], join(repoDir, ".bare"));
        const newResult = runWt(["new", "feature-ls-test"], { cwd: join(repoDir, "main"), env });
        expect(newResult.status).toBe(0);

        const result = runWt(["ls"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("feature-ls-test");
    });
});
