import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import * as git from "./git.js";
import * as output from "./output.js";

export const HEAVY_DIRS = [
    "node_modules",
    ".next",
    "dist",
    "build",
    ".turbo",
    ".cache",
    ".parcel-cache",
    ".nuxt",
    ".output",
    ".svelte-kit",
];

export class DirtyWorktreeError extends Error {
    constructor(
        public worktreePath: string,
        public override cause: unknown,
    ) {
        super(`Worktree has uncommitted changes: ${worktreePath}`);
        this.name = "DirtyWorktreeError";
    }
}

export interface RemoveWorktreeOptions {
    /** Force-remove dirty worktrees without raising DirtyWorktreeError. */
    force?: boolean;
    /** Delete the local branch after removing the worktree (skipped for the default branch). */
    deleteBranch?: boolean;
    /** Suppress stderr warnings (branch-delete failure). */
    quiet?: boolean;
}

export interface RemoveWorktreeResult {
    branchDeleted: boolean;
    branchName: string | null;
}

/**
 * Shared removal logic for `wt rm` and `wt clean`. Does not prompt — the caller
 * decides force / deleteBranch upfront. Throws DirtyWorktreeError if the tree
 * is dirty and force was not requested, so the caller can confirm and retry.
 */
export async function removeWorktree(
    root: string,
    name: string,
    opts: RemoveWorktreeOptions = {},
): Promise<RemoveWorktreeResult> {
    const worktreePath = join(root, name);

    if (!existsSync(worktreePath)) {
        // Directory is gone but git may still have the registration. Look up the
        // branch from the worktree list, prune the stale entry, then optionally
        // delete the branch — same outcome as a normal removal.
        const entries = git.worktreeList(root);
        const entry = entries.find((e) => e.path === worktreePath);
        const branchName = entry?.branch ?? null;

        git.worktreePrune(root, { now: true });

        let branchDeleted = false;
        if (opts.deleteBranch && branchName && branchName !== git.defaultBranch(root)) {
            try {
                git.branchDelete(root, branchName);
                branchDeleted = true;
            } catch (err) {
                if (!opts.quiet) {
                    output.warn(`Failed to delete branch '${branchName}': ${(err as Error).message}`);
                }
            }
        }
        return { branchDeleted, branchName };
    }

    const branchName = git.currentBranch(worktreePath);

    // Pre-delete heavy dirs to speed up `git worktree remove`. If we touch any,
    // we implicitly force-remove (the working tree is already dirty by our doing).
    let deletedAny = false;
    for (const dir of HEAVY_DIRS) {
        const dirPath = join(worktreePath, dir);
        if (existsSync(dirPath)) {
            deletedAny = true;
            await rm(dirPath, { recursive: true, force: true });
        }
    }

    const force = deletedAny || opts.force === true;
    try {
        git.worktreeRemove(root, worktreePath, force);
    } catch (err) {
        if (opts.force) throw err;
        throw new DirtyWorktreeError(worktreePath, err);
    }

    let branchDeleted = false;
    if (opts.deleteBranch && branchName && branchName !== git.defaultBranch(root)) {
        try {
            git.branchDelete(root, branchName);
            branchDeleted = true;
        } catch (err) {
            if (!opts.quiet) {
                output.warn(`Failed to delete branch '${branchName}': ${(err as Error).message}`);
            }
        }
    }

    return { branchDeleted, branchName };
}
