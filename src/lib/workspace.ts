import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

interface WorkspaceFolder {
    path: string;
    name: string;
}

interface WorkspaceFile {
    folders: WorkspaceFolder[];
    settings: Record<string, unknown>;
}

/**
 * Get the workspace file path: <root>/<repo-name>.code-workspace
 */
export function workspaceFilePath(root: string): string {
    return join(root, `${basename(root)}.code-workspace`);
}

function readWorkspace(filePath: string): WorkspaceFile {
    if (!existsSync(filePath)) {
        return { folders: [], settings: {} };
    }
    return JSON.parse(readFileSync(filePath, "utf-8"));
}

function writeWorkspace(filePath: string, workspace: WorkspaceFile): void {
    writeFileSync(filePath, JSON.stringify(workspace, null, 2) + "\n");
}

/**
 * Add a worktree folder to the workspace file (idempotent).
 */
export function workspaceAdd(root: string, worktreePath: string): void {
    const filePath = workspaceFilePath(root);
    const workspace = readWorkspace(filePath);
    const folderName = basename(worktreePath);

    // Skip if already present
    if (workspace.folders.some((f) => f.path === worktreePath)) return;

    workspace.folders.push({ path: worktreePath, name: folderName });
    writeWorkspace(filePath, workspace);
}

/**
 * Remove a worktree folder from the workspace file.
 */
export function workspaceRemove(root: string, worktreePath: string): void {
    const filePath = workspaceFilePath(root);
    if (!existsSync(filePath)) return;

    const workspace = readWorkspace(filePath);
    workspace.folders = workspace.folders.filter((f) => f.path !== worktreePath);
    writeWorkspace(filePath, workspace);
}

/**
 * Rebuild the workspace file from a list of worktree paths.
 */
export function workspaceSync(root: string, worktreePaths: string[]): void {
    const filePath = workspaceFilePath(root);
    const workspace: WorkspaceFile = { folders: [], settings: {} };

    for (const p of worktreePaths) {
        workspace.folders.push({ path: p, name: basename(p) });
    }

    writeWorkspace(filePath, workspace);
}

/**
 * Delete the workspace file.
 */
export function workspaceReset(root: string): boolean {
    const filePath = workspaceFilePath(root);
    if (existsSync(filePath)) {
        unlinkSync(filePath);
        return true;
    }
    return false;
}
