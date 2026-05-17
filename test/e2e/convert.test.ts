import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNormalRepo, makeTmpDir, runWt } from "./helpers.js";

/**
 * Convert tests — each test gets a fresh normal git repo.
 * Uses beforeEach/afterEach so failures don't bleed between tests.
 */
describe("wt convert", () => {
    let tmpDir: string;
    let repoPath: string;

    beforeEach(() => {
        tmpDir = makeTmpDir("convert");
        ({ repoPath } = createNormalRepo(tmpDir));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    // 1. Basic conversion — .git becomes .bare, default worktree created
    it("converts a normal repo into bare worktree structure", () => {
        const result = runWt(["convert", "--yes", "--no-config"], { cwd: repoPath });
        expect(result.status).toBe(0);
        expect(existsSync(join(repoPath, ".bare"))).toBe(true);
        expect(existsSync(join(repoPath, ".git"))).toBe(false);
        expect(existsSync(join(repoPath, "main"))).toBe(true);
    });

    // 2. Already has .bare — exits 1 before conversion starts
    // The convert command guards: isNormalGitRepo + no .bare. If .bare already exists
    // while .git is still present (e.g. someone manually created it), it exits early.
    it("exits 1 when .bare directory already exists alongside .git", () => {
        // Simulate the "partially set up" state: normal .git repo + pre-existing .bare dir
        mkdirSync(join(repoPath, ".bare"), { recursive: true });

        const result = runWt(["convert", "--yes", "--no-config"], { cwd: repoPath });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(".bare exists");
    });

    // 3. Non-git directory — exits 1 because there is no .git
    it("exits 1 in a non-git directory", () => {
        const nonGitDir = mkdtempSync(join(tmpdir(), "wt-e2e-nongit-"));
        try {
            const result = runWt(["convert", "--yes", "--no-config"], { cwd: nonGitDir });
            expect(result.status).toBe(1);
            expect(result.stderr).toContain("Not a git repository");
        } finally {
            rmSync(nonGitDir, { recursive: true, force: true });
        }
    });

    // 4. Post-convert lifecycle — new, ls, rm all work after conversion
    it("post-convert lifecycle: new + ls + rm work correctly", () => {
        // Convert
        const convertResult = runWt(["convert", "--yes", "--no-config"], { cwd: repoPath });
        expect(convertResult.status).toBe(0);

        // new — create a worktree from the converted repo
        const newResult = runWt(["new", "post-convert-branch", "--foreground"], { cwd: repoPath });
        expect(newResult.status).toBe(0);
        expect(existsSync(join(repoPath, "post-convert-branch"))).toBe(true);
        expect(newResult.stdout.trim()).toBe(join(repoPath, "post-convert-branch"));

        // ls — both worktrees appear
        const lsResult = runWt(["ls"], { cwd: repoPath });
        expect(lsResult.status).toBe(0);
        expect(lsResult.stderr).toContain("main");
        expect(lsResult.stderr).toContain("post-convert-branch");

        // rm — removes the worktree dir
        const rmResult = runWt(["rm", "post-convert-branch", "--force", "--delete-branch"], { cwd: repoPath });
        expect(rmResult.status).toBe(0);
        expect(existsSync(join(repoPath, "post-convert-branch"))).toBe(false);
    });
});
