import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createRemote, GIT_ENV, makeTmpDir, runGit, runWt } from "./helpers.js";

/**
 * Full lifecycle tests — sequential, sharing one cloned repo.
 *
 * Tests run in order: clone → new → ls → cd → get → rm → re-get → …
 * A failure in an early test will cascade to later ones that depend on the
 * created state. This is intentional — the suite models a real workflow.
 */
describe("wt lifecycle", () => {
    let tmpDir: string;
    let remoteUrl: string;
    let repoRoot: string;

    beforeAll(() => {
        tmpDir = makeTmpDir("lifecycle");
        remoteUrl = createRemote(tmpDir);

        // Clone the repo — --no-config skips the interactive postSetupFlow wizard
        const result = runWt(["clone", remoteUrl, "my-repo", "--no-config"], { cwd: tmpDir });
        if (result.status !== 0) {
            throw new Error(`beforeAll clone failed:\n${result.stderr}`);
        }
        repoRoot = join(tmpDir, "my-repo");

        // Push feat/beta to the remote so test #13 has a matchable branch
        const remoteGitDir = join(tmpDir, "remote.git");
        const tmpBranch = join(tmpDir, "_feat_beta_init");
        runGit(["clone", `file://${remoteGitDir}`, tmpBranch], tmpDir);
        runGit(["checkout", "-b", "feat/beta"], tmpBranch);
        runGit(["commit", "--allow-empty", "-m", "chore: feat/beta branch"], tmpBranch);
        runGit(["push", "-u", "origin", "feat/beta"], tmpBranch);
        rmSync(tmpBranch, { recursive: true, force: true });
    });

    afterAll(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    // 1. clone — bare structure and default worktree created
    it("clone creates .bare/ and main/ worktree", () => {
        expect(existsSync(join(repoRoot, ".bare"))).toBe(true);
        expect(existsSync(join(repoRoot, "main"))).toBe(true);
    });

    // 2. clone duplicate — exits 1, reports the directory already exists
    it("clone duplicate exits 1", () => {
        const result = runWt(["clone", remoteUrl, "my-repo", "--no-config"], { cwd: tmpDir });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("already exists");
    });

    // 3. new test-branch — creates worktree dir and outputs path on stdout
    it("new test-branch creates worktree and outputs path", () => {
        const result = runWt(["new", "test-branch", "--foreground"], { cwd: repoRoot });
        expect(result.status).toBe(0);
        expect(existsSync(join(repoRoot, "test-branch"))).toBe(true);
        expect(result.stdout.trim()).toBe(join(repoRoot, "test-branch"));

        // Branch was pushed to remote
        const refs = runGit(["-C", join(repoRoot, ".bare"), "show-ref", "refs/remotes/origin/test-branch"], repoRoot);
        expect(refs).toContain("test-branch");
    });

    // 4. new duplicate — exits 1
    it("new duplicate exits 1", () => {
        const result = runWt(["new", "test-branch"], { cwd: repoRoot });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("already exists");
    });

    // 5. new feat/slashed — slash in branch name becomes dash in directory name
    it("new feat/slashed creates feat-slashed/ dir", () => {
        const result = runWt(["new", "feat/slashed", "--foreground"], { cwd: repoRoot });
        expect(result.status).toBe(0);
        expect(existsSync(join(repoRoot, "feat-slashed"))).toBe(true);
        expect(existsSync(join(repoRoot, "feat/slashed"))).toBe(false);
        expect(result.stdout.trim()).toBe(join(repoRoot, "feat-slashed"));
    });

    // 6. ls — all three worktrees appear in stderr output
    it("ls lists all worktrees", () => {
        const result = runWt(["ls"], { cwd: repoRoot });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("main");
        expect(result.stderr).toContain("test-branch");
        expect(result.stderr).toContain("feat-slashed");
    });

    // 7a. cd <name> — outputs absolute path on stdout
    it("cd main outputs the worktree path", () => {
        const result = runWt(["cd", "main"], { cwd: repoRoot });
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(join(repoRoot, "main"));
    });

    // 7b. cd nonexistent — exits 1
    it("cd nonexistent exits 1", () => {
        const result = runWt(["cd", "nonexistent"], { cwd: repoRoot });
        expect(result.status).toBe(1);
    });

    // 8. get already-checked-out branch — worktree dir exists, exits 1
    it("get already-checked-out branch exits 1", () => {
        const result = runWt(["get", "test-branch", "--exact", "--foreground"], { cwd: repoRoot });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("already exists");
    });

    // 9. rm --force --delete-branch — removes worktree dir and deletes local branch
    it("rm --force --delete-branch removes dir and deletes branch", () => {
        const result = runWt(["rm", "test-branch", "--force", "--delete-branch"], { cwd: repoRoot });
        expect(result.status).toBe(0);
        expect(existsSync(join(repoRoot, "test-branch"))).toBe(false);

        // Local branch should be gone
        const branches = runGit(["-C", join(repoRoot, ".bare"), "branch", "--list", "test-branch"], repoRoot);
        expect(branches.trim()).toBe("");
    });

    // 10. rm nonexistent — exits 1
    it("rm nonexistent exits 1", () => {
        const result = runWt(["rm", "nonexistent", "--force", "--keep-branch"], { cwd: repoRoot });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("not found");
    });

    // 11. get after rm — re-creates worktree from remote ref
    it("get after rm re-creates the worktree", () => {
        // test-branch was deleted locally (test #9) but origin still has it
        const result = runWt(["get", "test-branch", "--exact", "--foreground"], { cwd: repoRoot });
        expect(result.status).toBe(0);
        expect(existsSync(join(repoRoot, "test-branch"))).toBe(true);
        expect(result.stdout.trim()).toBe(join(repoRoot, "test-branch"));
    });

    // 12. rm --force --keep-branch — removes worktree dir, leaves branch intact
    it("rm --force --keep-branch removes dir but keeps the branch", () => {
        const result = runWt(["rm", "test-branch", "--force", "--keep-branch"], { cwd: repoRoot });
        expect(result.status).toBe(0);
        expect(existsSync(join(repoRoot, "test-branch"))).toBe(false);

        // Branch should still exist (either local or on remote)
        const remoteRef = runGit(
            ["-C", join(repoRoot, ".bare"), "show-ref", "refs/remotes/origin/test-branch"],
            repoRoot,
        );
        expect(remoteRef).toContain("test-branch");
    });

    // 13. get with pattern matching and --first — auto-selects without prompting
    it("get feat/beta --first creates worktree without prompting", () => {
        const result = runWt(["get", "feat/beta", "--first", "--foreground"], { cwd: repoRoot });
        expect(result.status).toBe(0);
        expect(existsSync(join(repoRoot, "feat-beta"))).toBe(true);
        expect(result.stdout.trim()).toBe(join(repoRoot, "feat-beta"));
    });

    // 14. get no match — exits 1, reports no branch found
    it("get no match exits 1", () => {
        const result = runWt(["get", "zzz-no-match-xyz", "--exact"], { cwd: repoRoot, env: GIT_ENV });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("No branch found matching");
    });
});
