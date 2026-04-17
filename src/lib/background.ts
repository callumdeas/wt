import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const MAX_LOGS = 20;

/**
 * Prepare a log file path under `<root>/.logs/`, creating the directory if needed
 * and pruning the oldest logs to keep at most MAX_LOGS files.
 */
export function prepareLogFile(root: string, name: string): string {
    const logDir = join(root, ".logs");
    mkdirSync(logDir, { recursive: true });

    // Prune oldest logs beyond MAX_LOGS (by mtime)
    const files = readdirSync(logDir)
        .map((f) => ({ name: f, mtime: statSync(join(logDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
    for (const old of files.slice(MAX_LOGS - 1)) {
        unlinkSync(join(logDir, old.name));
    }

    return join(logDir, `${name}.log`);
}

export interface BackgroundOpts {
    cmd: string;
    cwd: string;
    logFile: string;
    notifyTitle: string;
    notifyMessage: string;
}

/**
 * Spawn a fully detached background process that runs the given command
 * and fires a macOS notification on success.
 * All output is logged to `logFile`. The process cannot write to the terminal.
 */
export function spawnBackground(opts: BackgroundOpts): void {
    const parts: string[] = [opts.cmd];

    // macOS notification — best-effort, no-op on Linux/CI
    // Escape both single quotes (for sh) and double quotes (for AppleScript)
    const escapeForNotification = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "'\\''");
    const title = escapeForNotification(opts.notifyTitle);
    const msg = escapeForNotification(opts.notifyMessage);
    parts.push(`osascript -e 'display notification "${msg}" with title "${title}"' 2>/dev/null || true`);

    const fullCmd = parts.join(" && ");

    const fd = openSync(opts.logFile, "a");
    const child = spawn("sh", ["-c", fullCmd], {
        cwd: opts.cwd,
        detached: true,
        stdio: ["ignore", fd, fd],
    });
    child.unref();
    closeSync(fd);
}
