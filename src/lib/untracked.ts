import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

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
