import { blank, dim, pc, plain } from "./output.js";

const treeLines = [
    "         ,@@@,",
    "        ,@@@@@@@,",
    "       ,@/@@@@@\\@@,",
    "      ,@@\\@@@/@@\\@@,",
    "      @@@\\@@/ \\@@@@@",
    "      @@@\\ V /@@@@@@",
    "       '@\\   /@@@@'",
    "          |o|",
    "          |||",
    "          |||",
    "       ___| |___",
];

const logoLines = ["           __", " _      __/ /_", "| | /| / / __/", "| |/ |/ / /_", "|__/|__/\\__/"];

const GAP = "    "; // space between tree and logo
const TRUNK_START_ROW = 7;
const LOGO_START_ROW = treeLines.length - logoLines.length; // bottom-aligned
const TREE_WIDTH = Math.max(...treeLines.map((l) => l.length));
const LOGO_WIDTH = Math.max(...logoLines.map((l) => l.length));

const tagline = "🌲 git worktree manager 🌲";
const TAGLINE_VISUAL_WIDTH = 26;

export function printBanner(): void {
    const cols = process.stderr.columns || 80;
    const blockWidth = TREE_WIDTH + GAP.length + LOGO_WIDTH;
    const leftPad = " ".repeat(Math.max(0, Math.floor((cols - blockWidth) / 2)));
    const taglinePad = " ".repeat(Math.max(0, Math.floor((cols - TAGLINE_VISUAL_WIDTH) / 2)));

    blank();

    for (let i = 0; i < treeLines.length; i++) {
        const treePart = treeLines[i].padEnd(TREE_WIDTH);
        const treePc = i < TRUNK_START_ROW ? pc.bold(pc.green(treePart)) : pc.yellow(treePart);
        const logoIdx = i - LOGO_START_ROW;

        if (logoIdx >= 0 && logoIdx < logoLines.length) {
            plain(leftPad + treePc + GAP + pc.bold(pc.cyan(logoLines[logoIdx])));
        } else {
            plain(leftPad + treePc);
        }
    }

    blank();
    dim(taglinePad + tagline);
    blank();
}
