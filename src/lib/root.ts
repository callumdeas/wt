import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Best-effort `process.cwd()` that returns null when the working directory
 * no longer exists (e.g. the user removed the worktree they were sitting in).
 * Without this guard, libuv throws ENOENT (uv_cwd) and crashes the CLI.
 */
function safeCwd(): string | null {
    try {
        return process.cwd();
    } catch {
        return null;
    }
}

/**
 * Walk up from startDir looking for a .bare/ directory.
 * Returns the directory containing .bare, or null if not found
 * (or if the current working directory has been deleted).
 */
export function findRoot(startDir?: string): string | null {
    const start = startDir ?? safeCwd();
    if (!start) return null;
    let dir = resolve(start);

    while (true) {
        if (existsSync(join(dir, ".bare"))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) {
            // Reached filesystem root
            return null;
        }
        dir = parent;
    }
}

/**
 * Walk up from startDir looking for a .bare/ directory.
 * Throws if not found.
 */
export function requireRoot(startDir?: string): string {
    const root = findRoot(startDir);
    if (!root) {
        throw new Error("Not in a worktree-managed repository (no .bare found)");
    }
    return root;
}
