import { rmSync } from "node:fs";
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
});
