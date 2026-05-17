import type { StdioOptions } from "node:child_process";
import { execSync } from "node:child_process";
import { join } from "node:path";

function exec(cmd: string, opts?: { cwd?: string; stdio?: "inherit" | "pipe" }): string {
    // When "inherit", redirect child stdout to stderr so git output reaches the
    // terminal without polluting the stdout IPC channel used by the shell wrapper.
    const stdio: StdioOptions =
        opts?.stdio === "inherit" ? ["inherit", process.stderr, "inherit"] : (opts?.stdio ?? "pipe");
    const result = execSync(cmd, {
        cwd: opts?.cwd,
        stdio,
        encoding: "utf-8",
    });
    // execSync returns null when stdio is "inherit" — TS types don't model this
    if (result == null) return "";
    return result.trim();
}

/** Get the .bare directory path from a worktree root */
export function bareDir(root: string): string {
    return join(root, ".bare");
}

export function fetch(root: string): void {
    exec(`git -C "${bareDir(root)}" fetch origin`, { stdio: "inherit" });
}

export function worktreeAdd(
    root: string,
    worktreePath: string,
    branch: string,
    opts?: { track?: string; newBranch?: boolean; noTrack?: boolean },
): void {
    const bare = bareDir(root);
    if (opts?.newBranch) {
        const trackFlag = opts.noTrack ? " --no-track" : "";
        exec(
            `git -C "${bare}" worktree add${trackFlag} -b "${branch}" "${worktreePath}" "${opts.track ?? `origin/${branch}`}"`,
            {
                stdio: "inherit",
            },
        );
    } else if (opts?.track) {
        exec(`git -C "${bare}" worktree add --track -b "${branch}" "${worktreePath}" "${opts.track}"`, {
            stdio: "inherit",
        });
    } else {
        exec(`git -C "${bare}" worktree add "${worktreePath}" "${branch}"`, { stdio: "inherit" });
    }
}

export function worktreeRemove(root: string, worktreePath: string, force: boolean = false): void {
    const forceFlag = force ? " --force" : "";
    exec(`git -C "${bareDir(root)}" worktree remove${forceFlag} "${worktreePath}"`, { stdio: "inherit" });
}

export function worktreePrune(root: string, opts?: { now?: boolean }): void {
    const expireFlag = opts?.now ? " --expire now" : "";
    exec(`git -C "${bareDir(root)}" worktree prune${expireFlag}`);
}

export interface WorktreeEntry {
    path: string;
    branch: string;
    dirname: string;
}

export function worktreeList(root: string): WorktreeEntry[] {
    const bare = bareDir(root);
    const raw = exec(`git -C "${bare}" worktree list`);
    const entries: WorktreeEntry[] = [];

    for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const path = line.split(/\s+/)[0];
        const branchMatch = line.match(/\[(.+?)\]/);
        const branch = branchMatch?.[1] ?? "";

        // Skip the bare repo itself
        if (path === bare) continue;

        entries.push({
            path,
            branch,
            dirname: path.split("/").pop() ?? "",
        });
    }

    return entries;
}

export function branchListRemote(root: string): string[] {
    const raw = exec(`git -C "${bareDir(root)}" branch -r`);
    return raw
        .split("\n")
        .map((b) => b.trim())
        .filter((b) => b && !b.includes("HEAD"))
        .map((b) => b.replace(/^origin\//, ""));
}

export function branchListLocal(root: string): string[] {
    const raw = exec(`git -C "${bareDir(root)}" branch --format="%(refname:short)"`);
    return raw
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean);
}

export interface LocalBranch {
    name: string;
    date: string;
}

export function branchListLocalWithDates(root: string): LocalBranch[] {
    const raw = exec(
        `git -C "${bareDir(root)}" for-each-ref --sort=-committerdate refs/heads/ --format="%(refname:short)%09%(committerdate:relative)"`,
    );
    return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const [name, date] = line.split("\t");
            return { name: name.trim(), date: date?.trim() ?? "" };
        });
}

export function branchDelete(root: string, branch: string): void {
    exec(`git -C "${bareDir(root)}" branch -D "${branch}"`, { cwd: bareDir(root), stdio: "inherit" });
}

export function branchExists(root: string, branch: string): boolean {
    try {
        exec(`git -C "${bareDir(root)}" show-ref --verify --quiet "refs/heads/${branch}"`);
        return true;
    } catch {
        return false;
    }
}

export function remoteBranchExists(root: string, branch: string): boolean {
    try {
        exec(`git -C "${bareDir(root)}" show-ref --verify --quiet "refs/remotes/origin/${branch}"`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Set refs/remotes/origin/HEAD by querying the remote.
 * Ensures defaultBranch() can detect non-standard defaults (e.g. trunk, develop).
 */
export function remoteSetHead(root: string): void {
    try {
        exec(`git -C "${bareDir(root)}" remote set-head origin --auto`);
    } catch {
        // Non-fatal: defaultBranch() has its own fallback
    }
}

export function defaultBranch(root: string): string {
    try {
        const ref = exec(`git -C "${bareDir(root)}" symbolic-ref refs/remotes/origin/HEAD`);
        return ref.replace("refs/remotes/origin/", "");
    } catch {
        // Fallback: check common branch names
        for (const name of ["main", "master", "develop"]) {
            if (remoteBranchExists(root, name)) return name;
        }
        return "main";
    }
}

export function setUpstream(worktreePath: string, branch: string): void {
    try {
        exec(`git -C "${worktreePath}" branch --set-upstream-to="origin/${branch}" "${branch}"`);
    } catch {
        // Ignore — upstream may already be set
    }
}

/**
 * Configure tracking for a branch via git config.
 * Unlike setUpstream(), this does NOT require origin/<branch> to exist yet —
 * it writes the config entries directly, so it works for newly created branches
 * that haven't been pushed.
 */
export function configureTracking(worktreePath: string, branch: string): void {
    exec(`git -C "${worktreePath}" config "branch.${branch}.remote" "origin"`);
    exec(`git -C "${worktreePath}" config "branch.${branch}.merge" "refs/heads/${branch}"`);
}

export function push(worktreePath: string, branch: string, setUpstream: boolean = false): void {
    const flags = setUpstream ? " -u" : "";
    exec(`git -C "${worktreePath}" push${flags} origin "${branch}"`, { stdio: "inherit" });
}

export function merge(worktreePath: string, ref: string): void {
    exec(`git -C "${worktreePath}" merge "${ref}"`, { stdio: "inherit" });
}

export function currentBranch(worktreePath: string): string | null {
    try {
        return exec(`git -C "${worktreePath}" rev-parse --abbrev-ref HEAD`);
    } catch {
        return null;
    }
}

export function cloneBare(url: string, targetDir: string): void {
    exec(`git clone --bare "${url}" "${targetDir}"`, { stdio: "inherit" });
}

export function configSet(bareDir: string, key: string, value: string): void {
    exec(`git -C "${bareDir}" config ${key} "${value}"`);
}

/**
 * Check if dir is a normal (non-bare) git repository with a .git directory.
 * Returns false for bare repos, submodules (.git is a file), and non-repos.
 */
export function isNormalGitRepo(dir: string): boolean {
    try {
        const result = exec(`git -C "${dir}" rev-parse --git-dir`);
        return result === ".git";
    } catch {
        return false;
    }
}

/**
 * Check if the working tree has modified or staged changes.
 * Untracked files (??) are intentionally ignored — they will be
 * moved along with everything else during conversion.
 */
export function isCleanWorkingTree(dir: string): boolean {
    const status = exec(`git -C "${dir}" status --porcelain`);
    if (!status) return true;
    return !status.split("\n").some((l) => l.trim() && !l.startsWith("??"));
}
