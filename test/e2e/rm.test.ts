import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { GIT_ENV, createRemote, makeTmpDir, runGit, runWt } from "./helpers.js";

describe("wt rm (current repo)", () => {
    let baseDir = "";
    let repoDir = "";
    let env: NodeJS.ProcessEnv;

    beforeEach(() => {
        baseDir = makeTmpDir("rm");
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

    function createWorktree(name: string): string {
        const bareDir = join(repoDir, ".bare");
        const worktreePath = join(repoDir, name);
        runGit(["branch", name, "main"], bareDir);
        runGit(["worktree", "add", worktreePath, name], bareDir);
        return worktreePath;
    }

    it("removes a worktree from the current repo by name", () => {
        const worktreePath = createWorktree("rm-feature");
        expect(existsSync(worktreePath)).toBe(true);

        const result = runWt(["rm", "rm-feature", "--keep-branch", "--force"], {
            cwd: join(repoDir, "main"),
            env,
        });

        expect(result.status).toBe(0);
        expect(result.stderr).toContain("Worktree removed");
        expect(existsSync(worktreePath)).toBe(false);
    });

    it("deletes the branch when --delete-branch is given", () => {
        createWorktree("rm-delete-branch");
        const bareDir = join(repoDir, ".bare");

        const result = runWt(["rm", "rm-delete-branch", "--delete-branch", "--force"], {
            cwd: join(repoDir, "main"),
            env,
        });

        expect(result.status).toBe(0);
        expect(result.stderr).toContain("Branch deleted");

        // Branch should no longer exist
        const branches = runGit(["branch", "--list", "rm-delete-branch"], bareDir);
        expect(branches).toBe("");
    });

    it("keeps the branch when --keep-branch is given", () => {
        createWorktree("rm-keep-branch");
        const bareDir = join(repoDir, ".bare");

        const result = runWt(["rm", "rm-keep-branch", "--keep-branch", "--force"], {
            cwd: join(repoDir, "main"),
            env,
        });

        expect(result.status).toBe(0);
        expect(result.stderr).not.toContain("Branch deleted");

        // Branch should still exist
        const branches = runGit(["branch", "--list", "rm-keep-branch"], bareDir);
        expect(branches).toContain("rm-keep-branch");
    });

    it("errors when the worktree name does not exist", () => {
        const result = runWt(["rm", "no-such-worktree", "--keep-branch", "--force"], {
            cwd: join(repoDir, "main"),
            env,
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("not found");
    });

    it("refuses to remove the default branch worktree", () => {
        const result = runWt(["rm", "main", "--keep-branch", "--force"], {
            cwd: join(repoDir, "main"),
            env,
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("default branch");
    });

    it("accepts the alias 'remove'", () => {
        createWorktree("rm-alias-test");
        const result = runWt(["remove", "rm-alias-test", "--keep-branch", "--force"], {
            cwd: join(repoDir, "main"),
            env,
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("Worktree removed");
    });
});
