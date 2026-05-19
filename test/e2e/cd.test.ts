import { rmSync } from "node:fs";
import { join } from "node:path";
import { GIT_ENV, createRemote, makeTmpDir, runGit, runWt } from "./helpers.js";

describe("wt cd (non-interactive)", () => {
    let baseDir = "";
    let repoDir = "";
    let env: NodeJS.ProcessEnv;

    beforeEach(() => {
        baseDir = makeTmpDir("cd");
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

    it("resolves a worktree by name without prompts when name is given", () => {
        const result = runWt(["cd", "main"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(join(repoDir, "main"));
    });

    it("resolves cross-repo with --repo and name without prompts", () => {
        const result = runWt(["cd", "--repo", "repo", "main"], { cwd: baseDir, env });
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(join(repoDir, "main"));
    });

    it("writes the path to stdout (not stderr)", () => {
        const result = runWt(["cd", "main"], { cwd: join(repoDir, "main"), env });
        expect(result.stdout).toContain(join(repoDir, "main"));
        expect(result.stderr).not.toContain(join(repoDir, "main"));
    });

    it("errors when the named worktree does not exist", () => {
        const result = runWt(["cd", "no-such-worktree"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("not found");
    });

    it("errors with an unknown --repo", () => {
        const result = runWt(["cd", "--repo", "nonexistent", "main"], { cwd: baseDir, env });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Unknown repo");
    });

    it("resolves a newly created worktree by name", () => {
        const bareDir = join(repoDir, ".bare");
        runGit(["fetch", "--all"], bareDir);
        runWt(["new", "cd-feature"], { cwd: join(repoDir, "main"), env });

        const result = runWt(["cd", "cd-feature"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(join(repoDir, "cd-feature"));
    });
});
