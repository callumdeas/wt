import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import * as output from "./output.js";

const GENERATED_DIRS = new Set([
    "node_modules",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".turbo",
    ".cache",
    ".expo",
    "coverage",
    "out",
    ".parcel-cache",
    "storybook-static",
]);

function isGenerated(filePath: string): boolean {
    return filePath.split("/").some((segment) => GENERATED_DIRS.has(segment));
}

function lsFiles(dir: string, args: string[]): string[] {
    const result = spawnSync("git", ["-C", dir, "ls-files", ...args], { encoding: "utf-8" });
    if (result.status !== 0) return [];
    return result.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
}

/** Returns untracked files (both gitignored and non-ignored) relative to dir, excluding generated dirs. */
export function collectUntrackedFiles(dir: string): string[] {
    const untracked = lsFiles(dir, ["--others", "--exclude-standard"]);
    const ignored = lsFiles(dir, ["--others", "--ignored", "--exclude-standard"]);
    const all = [...new Set([...untracked, ...ignored])];
    return all.filter((f) => !isGenerated(f));
}

/**
 * Copy untracked files (e.g. .env) from the default branch worktree into a new worktree.
 * No-ops if the default worktree directory doesn't exist yet.
 */
export function copyUntrackedFromDefault(root: string, defBranch: string, worktreeDir: string): void {
    const defWorktreeDir = join(root, defBranch);
    if (!existsSync(defWorktreeDir)) return;
    const files = collectUntrackedFiles(defWorktreeDir);
    const copied = copyUntrackedFiles(defWorktreeDir, worktreeDir, files);
    if (copied.length > 0) {
        output.success(`Copied ${copied.length} untracked file(s) from ${defBranch}/`);
        for (const f of copied) output.dim(`  ${f}`);
    }
}

/** Copies files (relative paths) from srcDir to destDir, preserving directory structure. Returns copied paths. */
export function copyUntrackedFiles(srcDir: string, destDir: string, files: string[]): string[] {
    const copied: string[] = [];
    for (const file of files) {
        const src = join(srcDir, file);
        const dest = join(destDir, file);
        try {
            mkdirSync(dirname(dest), { recursive: true });
            cpSync(src, dest, { recursive: true });
            copied.push(file);
        } catch {
            // Skip files that can't be copied (e.g. deleted between collection and copy)
        }
    }
    return copied;
}
