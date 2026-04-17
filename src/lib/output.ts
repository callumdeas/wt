import picocolors from "picocolors";

// Output goes to stderr (stdout is the IPC channel for the shell wrapper),
// so base color detection on stderr.isTTY instead of picocolors' default stdout check.
const colorEnabled =
    !process.env.NO_COLOR &&
    (!!process.env.FORCE_COLOR || (!!process.stderr?.isTTY && process.env.TERM !== "dumb") || !!process.env.CI);

const pc = picocolors.createColors(colorEnabled);

export function error(msg: string): void {
    console.error(pc.red(`✗ ${msg}`));
}

export function success(msg: string): void {
    console.error(pc.green(`✓ ${msg}`));
}

export function warn(msg: string): void {
    console.error(pc.yellow(`⚠ ${msg}`));
}

export function info(msg: string): void {
    console.error(pc.cyan(msg));
}

export function dim(msg: string): void {
    console.error(pc.dim(msg));
}

export function plain(msg: string): void {
    console.error(msg);
}

export function blank(): void {
    console.error();
}

export { pc };

/**
 * Shared inquirer prompt theme — keeps select/confirm/input styling
 * consistent with the rest of the CLI (cyan names, yellow branches, etc.).
 */
export const promptTheme = {
    prefix: { idle: pc.magenta("?"), done: pc.green("✓") },
    style: {
        answer: (text: string) => pc.cyan(text),
        message: (text: string) => pc.bold(text),
        highlight: (text: string) => pc.bold(text),
        help: (text: string) => pc.dim(text),
        key: (text: string) => pc.cyan(pc.bold(`<${text}>`)),
        keysHelpTip: (keys: string[][]) =>
            [...keys, ["esc", "cancel"]]
                .map(([key, action]) => `${pc.bold(key)} ${pc.dim(action)}`)
                .join(pc.dim(" • ")),
    },
    icon: {
        cursor: pc.cyan("❯"),
    },
};
