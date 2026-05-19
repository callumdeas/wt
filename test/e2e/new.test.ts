import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GIT_ENV, createRemote, makeTmpDir, runGit, runWt } from "./helpers.js";

describe("wt new", () => {
    let baseDir = "";
    let repoDir = "";
    let env: NodeJS.ProcessEnv;

    beforeEach(() => {
        baseDir = makeTmpDir("new");
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

    it("tracks the new remote branch instead of the base branch", () => {
        const branch = "feature/no-auto-track";
        const result = runWt(["new", branch], { cwd: join(repoDir, "main"), env });

        expect(result.status).toBe(0);
        expect(result.stderr).not.toContain("set up to track 'origin/main'");
        expect(runGit(["config", "--get", `branch.${branch}.remote`], join(repoDir, "feature-no-auto-track"))).toBe(
            "origin",
        );
        expect(runGit(["config", "--get", `branch.${branch}.merge`], join(repoDir, "feature-no-auto-track"))).toBe(
            `refs/heads/${branch}`,
        );
    });

    it("copies untracked files from source worktree into the new worktree", () => {
        // Place a gitignored .env in the main worktree
        writeFileSync(join(repoDir, "main", ".env"), "SECRET=fromMain\n");

        const result = runWt(["new", "feature/env-copy", "--foreground"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(0);

        const copied = join(repoDir, "feature-env-copy", ".env");
        expect(existsSync(copied)).toBe(true);
        expect(readFileSync(copied, "utf-8")).toBe("SECRET=fromMain\n");
    });

    it("copies nested untracked files preserving directory structure", () => {
        mkdirSync(join(repoDir, "main", "apps", "web"), { recursive: true });
        writeFileSync(join(repoDir, "main", "apps", "web", ".env.local"), "URL=http://localhost\n");

        const result = runWt(["new", "feature/nested-env", "--foreground"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(0);

        const copied = join(repoDir, "feature-nested-env", "apps", "web", ".env.local");
        expect(existsSync(copied)).toBe(true);
        expect(readFileSync(copied, "utf-8")).toBe("URL=http://localhost\n");
    });
});

describe("wt get", () => {
    let baseDir = "";
    let repoDir = "";
    let env: NodeJS.ProcessEnv;

    beforeEach(() => {
        baseDir = makeTmpDir("get");
        env = { ...GIT_ENV, WT_CONFIG_HOME: join(baseDir, "config") };

        // Create a remote with a pre-existing branch for get to check out
        const remoteUrl = createRemote(baseDir);
        const clone = runWt(["clone", remoteUrl, "repo", "--no-config", "--no-install"], { cwd: baseDir, env });
        expect(clone.status).toBe(0);
        repoDir = join(baseDir, "repo");

        // Push a branch to the remote so wt get can find it
        runGit(["checkout", "-b", "existing-branch"], join(repoDir, "main"));
        runGit(["push", "-u", "origin", "existing-branch"], join(repoDir, "main"));
        runGit(["checkout", "main"], join(repoDir, "main"));
    });

    afterEach(() => {
        rmSync(baseDir, { recursive: true, force: true });
    });

    it("copies untracked files from source worktree when checking out an existing branch", () => {
        writeFileSync(join(repoDir, "main", ".env"), "SECRET=fromMain\n");

        const result = runWt(["get", "existing-branch", "--exact"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(0);

        const copied = join(repoDir, "existing-branch", ".env");
        expect(existsSync(copied)).toBe(true);
        expect(readFileSync(copied, "utf-8")).toBe("SECRET=fromMain\n");
    });

    it("matches with --exact for an exact branch name", () => {
        const result = runWt(["get", "existing-branch", "--exact"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(0);
        expect(existsSync(join(repoDir, "existing-branch"))).toBe(true);
    });

    it("fails with --exact when the branch name doesn't match exactly", () => {
        const result = runWt(["get", "existing", "--exact"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("No branch found matching");
    });

    it("auto-selects first match with --first when multiple branches match", () => {
        // Push a second branch that also matches "existing"
        runGit(["checkout", "-b", "existing-other"], join(repoDir, "main"));
        runGit(["push", "-u", "origin", "existing-other"], join(repoDir, "main"));
        runGit(["checkout", "main"], join(repoDir, "main"));

        const result = runWt(["get", "existing", "--first"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(0);
        // Should have picked one of the two without prompting
        const branchCreated =
            existsSync(join(repoDir, "existing-branch")) || existsSync(join(repoDir, "existing-other"));
        expect(branchCreated).toBe(true);
    });

    it("errors when no branch matches the pattern", () => {
        const result = runWt(["get", "totally-unknown-xyz", "--exact"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("No branch found matching");
    });

    it("derives directory name from ticket pattern (PROJ-123 → PROJ-123)", () => {
        runGit(["checkout", "-b", "feature/PROJ-42/add-widget"], join(repoDir, "main"));
        runGit(["push", "-u", "origin", "feature/PROJ-42/add-widget"], join(repoDir, "main"));
        runGit(["checkout", "main"], join(repoDir, "main"));

        const result = runWt(["get", "PROJ-42", "--exact"], { cwd: join(repoDir, "main"), env });
        expect(result.status).toBe(1); // --exact won't match partial

        const result2 = runWt(["get", "feature/PROJ-42/add-widget", "--exact"], {
            cwd: join(repoDir, "main"),
            env,
        });
        expect(result2.status).toBe(0);
        // Ticket pattern extracts the dir name
        expect(existsSync(join(repoDir, "PROJ-42"))).toBe(true);
    });
});
