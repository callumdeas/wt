import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Walk up from startDir looking for a .bare/ directory.
 * Returns the directory containing .bare, or null if not found.
 */
export function findRoot(startDir?: string): string | null {
    let dir = resolve(startDir ?? process.cwd());

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
