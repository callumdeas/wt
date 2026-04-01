import { execSync } from "node:child_process";
import { join } from "node:path";

function exec(cmd: string, opts?: { cwd?: string; stdio?: "inherit" | "pipe" }): string {
    return execSync(cmd, {
        cwd: opts?.cwd,
        stdio: opts?.stdio ?? "pipe",
        encoding: "utf-8",
    }).trim();
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
    opts?: { track?: string; newBranch?: boolean },
): void {
    const bare = bareDir(root);
    if (opts?.newBranch) {
        exec(`git -C "${bare}" worktree add -b "${branch}" "${worktreePath}" "${opts.track ?? `origin/${branch}`}"`, {
            stdio: "inherit",
        });
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

export function branchDelete(root: string, branch: string): void {
    exec(`git -C "${bareDir(root)}" branch -D "${branch}"`, { stdio: "inherit" });
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
