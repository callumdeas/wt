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

/**
 * Print a section heading for grouped wizard prompts. Subtitle (one-line
 * help text) is dimmed beneath the heading. Use this to break long
 * sequential prompts into visually-distinct stages.
 */
export function section(title: string, subtitle?: string): void {
    console.error();
    console.error(pc.bold(pc.magenta(`▸ ${title}`)));
    if (subtitle) console.error(pc.dim(`  ${subtitle}`));
    console.error();
}

/**
 * Render a key/value summary inside a light box. Used to confirm saved
 * config at the end of the wizard so users see exactly what landed on disk.
 */
export function summaryBox(rows: { key: string; value: string }[]): void {
    if (rows.length === 0) return;
    const keyWidth = Math.max(...rows.map((r) => r.key.length));
    const top = pc.dim("┌─");
    const mid = pc.dim("│ ");
    const bottom = pc.dim("└─");
    console.error(top);
    for (const row of rows) {
        const k = pc.dim(row.key.padEnd(keyWidth));
        const v = row.value === "" ? pc.dim("—") : pc.cyan(row.value);
        console.error(`${mid}${k}  ${v}`);
    }
    console.error(bottom);
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
