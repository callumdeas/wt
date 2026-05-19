import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Resolved from project root — jest's working directory when running tests
const CLI_PATH = resolve(process.cwd(), "dist/cli.js");

/**
 * Isolated git environment: prevents tests from touching the user's git identity
 * or system config. GIT_CONFIG_GLOBAL=/dev/null suppresses ~/.gitconfig reads.
 */
export const GIT_ENV: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "Test User",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test User",
    GIT_COMMITTER_EMAIL: "test@example.com",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    NO_COLOR: "1",
    WT_NO_UPDATE_CHECK: "1",
};

export interface RunResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

/**
 * Invoke the CLI via subprocess. stdin has no TTY, which auto-enables --foreground
 * for post-create hooks in new.ts and get.ts — no background processes in tests.
 */
export function runWt(args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }): RunResult {
    const result = spawnSync("node", [CLI_PATH, ...args], {
        cwd: opts.cwd,
        env: opts.env ?? GIT_ENV,
        encoding: "utf-8",
    });
    return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}

/**
 * Run a raw git command. Throws if the command exits non-zero.
 */
export function runGit(args: string[], cwd: string): string {
    const result = spawnSync("git", args, {
        cwd,
        env: GIT_ENV,
        encoding: "utf-8",
    });
    if (result.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed (exit ${result.status}):\n${result.stderr}`);
    }
    return result.stdout.trim();
}

/**
 * Create a local bare "remote" with one commit on main.
 * Returns a file:// URL that wt clone can use.
 *
 * Steps: init bare → init temp clone → commit README → push → rm temp clone.
 * We can't commit directly into a bare repo, so the temp clone exists only
 * during setup.
 */
export function createRemote(baseDir: string): string {
    const remotePath = join(baseDir, "remote.git");
    const tmpClone = join(baseDir, "_remote_init");

    mkdirSync(remotePath, { recursive: true });
    mkdirSync(tmpClone, { recursive: true });

    // Bare repo acts as the "remote"
    runGit(["init", "--bare", remotePath], baseDir);

    // Temp working clone to create the initial commit
    runGit(["init", "-b", "main", tmpClone], baseDir);
    writeFileSync(join(tmpClone, "README.md"), "# Test repo\n");
    runGit(["add", "."], tmpClone);
    runGit(["commit", "-m", "chore: initial commit"], tmpClone);
    runGit(["remote", "add", "origin", `file://${remotePath}`], tmpClone);
    runGit(["push", "-u", "origin", "main"], tmpClone);

    rmSync(tmpClone, { recursive: true, force: true });

    return `file://${remotePath}`;
}

/**
 * Create a normal (non-bare) git repo with a remote configured.
 * Used for wt convert tests — requires .git/, a clean tree, and an origin.
 */
export function createNormalRepo(baseDir: string): { repoPath: string; remoteUrl: string } {
    const remotePath = join(baseDir, "convert-remote.git");
    const repoPath = join(baseDir, "to-convert");

    mkdirSync(remotePath, { recursive: true });
    mkdirSync(repoPath, { recursive: true });

    runGit(["init", "--bare", remotePath], baseDir);
    runGit(["init", "-b", "main", repoPath], baseDir);
    writeFileSync(join(repoPath, "README.md"), "# To convert\n");
    runGit(["add", "."], repoPath);
    runGit(["commit", "-m", "chore: initial commit"], repoPath);
    runGit(["remote", "add", "origin", `file://${remotePath}`], repoPath);
    runGit(["push", "-u", "origin", "main"], repoPath);

    return { repoPath, remoteUrl: `file://${remotePath}` };
}

/**
 * Poll until a file exists or the timeout elapses. Rejects on timeout.
 * Used in async tests that need to wait for a detached background process to write a file.
 */
export async function waitForFile(filePath: string, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!existsSync(filePath)) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for: ${filePath}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
}

/**
 * Create an isolated tmpdir for a test suite. Returns the path.
 * Caller is responsible for rmSync on cleanup.
 */
/**
 * Create an isolated tmpdir for a test suite. Returns the real (symlink-resolved) path.
 * On macOS /tmp is a symlink to /private/tmp — using realpathSync ensures our path
 * strings match what process.cwd() returns inside spawned subprocesses.
 * Caller is responsible for rmSync on cleanup.
 */
export function makeTmpDir(prefix: string): string {
    return realpathSync(mkdtempSync(join(tmpdir(), `wt-e2e-${prefix}-`)));
}
