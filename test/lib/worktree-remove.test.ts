import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DirtyWorktreeError, removeWorktree } from "../../src/lib/worktree-remove.js";
import { makeTmpDir, runGit } from "../e2e/helpers.js";

/**
 * Build a bare-repo workflow tmp dir with a single worktree off main.
 * Returns { root, worktreeName, worktreePath }.
 */
function setupRepo(): { root: string; worktreeName: string; worktreePath: string; tmp: string } {
    const tmp = makeTmpDir("rm-helper");

    // Create a bare "remote" with one commit on main.
    const remote = join(tmp, "remote.git");
    const seed = join(tmp, "seed");
    mkdirSync(remote, { recursive: true });
    mkdirSync(seed, { recursive: true });
    runGit(["init", "--bare", remote], tmp);
    runGit(["init", "-b", "main", seed], tmp);
    writeFileSync(join(seed, "README.md"), "# seed\n");
    runGit(["add", "."], seed);
    runGit(["commit", "-m", "init"], seed);
    runGit(["remote", "add", "origin", `file://${remote}`], seed);
    runGit(["push", "-u", "origin", "main"], seed);

    // Set up the bare-repo workflow: root/.bare with a main worktree.
    const root = join(tmp, "repo");
    const bare = join(root, ".bare");
    mkdirSync(root, { recursive: true });
    runGit(["clone", "--bare", `file://${remote}`, bare], tmp);
    runGit(["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"], bare);
    runGit(["fetch", "origin"], bare);
    runGit(["worktree", "add", join(root, "main"), "main"], bare);

    // Create a feature branch + worktree to remove.
    const worktreeName = "feature-x";
    const worktreePath = join(root, worktreeName);
    runGit(["worktree", "add", "-b", "feature-x", worktreePath, "main"], bare);

    return { root, worktreeName, worktreePath, tmp };
}

describe("removeWorktree", () => {
    let ctx: ReturnType<typeof setupRepo>;

    beforeEach(() => {
        ctx = setupRepo();
    });

    afterEach(() => {
        rmSync(ctx.tmp, { recursive: true, force: true });
    });

    it("removes a clean worktree and deletes its branch when requested", async () => {
        const result = await removeWorktree(ctx.root, ctx.worktreeName, { deleteBranch: true });
        expect(existsSync(ctx.worktreePath)).toBe(false);
        expect(result.branchDeleted).toBe(true);
        expect(result.branchName).toBe("feature-x");
    });

    it("preserves the branch when deleteBranch is false", async () => {
        const result = await removeWorktree(ctx.root, ctx.worktreeName, { deleteBranch: false });
        expect(result.branchDeleted).toBe(false);
        const branches = runGit(["branch", "--format=%(refname:short)"], join(ctx.root, ".bare"));
        expect(branches.split("\n")).toContain("feature-x");
    });

    it("throws DirtyWorktreeError when the tree has uncommitted changes and force is not set", async () => {
        writeFileSync(join(ctx.worktreePath, "dirty.txt"), "uncommitted\n");
        runGit(["add", "dirty.txt"], ctx.worktreePath);
        await expect(removeWorktree(ctx.root, ctx.worktreeName, {})).rejects.toBeInstanceOf(DirtyWorktreeError);
        expect(existsSync(ctx.worktreePath)).toBe(true);
    });

    it("force-removes a dirty worktree when force is true", async () => {
        writeFileSync(join(ctx.worktreePath, "dirty.txt"), "uncommitted\n");
        runGit(["add", "dirty.txt"], ctx.worktreePath);
        await removeWorktree(ctx.root, ctx.worktreeName, { force: true, deleteBranch: true });
        expect(existsSync(ctx.worktreePath)).toBe(false);
    });

    it("treats heavy directories as auto-force (cleans node_modules + removes even if tree was 'dirty' from heavy dir)", async () => {
        // node_modules is technically ignored by git, so this isn't truly "dirty" — but the heavy-dir
        // pre-clean path is important. Verify it runs and the worktree is removed.
        mkdirSync(join(ctx.worktreePath, "node_modules", "foo"), { recursive: true });
        writeFileSync(join(ctx.worktreePath, "node_modules", "foo", "x.js"), "x\n");
        await removeWorktree(ctx.root, ctx.worktreeName, { deleteBranch: false });
        expect(existsSync(ctx.worktreePath)).toBe(false);
    });

    it("does not delete the default branch even if deleteBranch is true", async () => {
        // Try to remove the main worktree (the default branch).
        await removeWorktree(ctx.root, "main", { deleteBranch: true, force: true });
        const branches = runGit(["branch", "--format=%(refname:short)"], join(ctx.root, ".bare"));
        expect(branches.split("\n")).toContain("main");
    });
});
