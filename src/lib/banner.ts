import { blank, dim, pc, plain } from "./output.js";

const logoLines = ["           __", " _      __/ /_", "| | /| / / __/", "| |/ |/ / /_", "|__/|__/\\__/"];

const tagline = "🌲 git worktree manager 🌲";
const taglineVisualWidth = 26; // emojis are 2 columns each

export function printBanner(): void {
    const cols = process.stderr.columns || 80;
    const blockWidth = Math.max(...logoLines.map((l) => l.length));
    const blockPad = " ".repeat(Math.max(0, Math.floor((cols - blockWidth) / 2)));
    const taglinePad = " ".repeat(Math.max(0, Math.floor((cols - taglineVisualWidth) / 2)));

    blank();

    for (const line of logoLines) {
        plain(pc.bold(pc.cyan(blockPad + line)));
    }

    blank();
    dim(taglinePad + tagline);
    blank();
}
