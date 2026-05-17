import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A suggested post-create command, derived from manifests/lockfiles in a worktree.
 * Used by the interactive config wizard to turn the post-create prompt from a
 * blind free-form input into a curated select with sensible defaults.
 */
export interface SetupSuggestion {
    /** The actual shell command (e.g. "pnpm install"). */
    command: string;
    /** Short label shown in the menu (e.g. "pnpm install"). */
    label: string;
    /** One-line context: why this was suggested (e.g. "detected pnpm-lock.yaml"). */
    hint: string;
    /** Ecosystem tag — used to dedupe within an ecosystem and to build chained suggestions. */
    ecosystem: "node" | "ruby" | "python" | "rust" | "go" | "elixir" | "php" | "make" | "script";
}

interface NodeManager {
    name: string;
    install: string;
    lockfile: string;
}

const NODE_MANAGERS: NodeManager[] = [
    { name: "pnpm", install: "pnpm install", lockfile: "pnpm-lock.yaml" },
    { name: "yarn", install: "yarn install", lockfile: "yarn.lock" },
    { name: "bun", install: "bun install", lockfile: "bun.lockb" },
    { name: "npm", install: "npm install", lockfile: "package-lock.json" },
];

function fileExists(dir: string, name: string): boolean {
    return existsSync(join(dir, name));
}

/**
 * Read package.json and look for a setup-style script the repo author has
 * already defined. These almost always beat a bare `install` because repos
 * with custom bootstrap (codegen, husky, submodules) put it here.
 */
function detectNodeScript(dir: string, manager: string): SetupSuggestion | undefined {
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) return undefined;

    try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const scripts = pkg.scripts ?? {};
        for (const scriptName of ["setup", "bootstrap"]) {
            if (typeof scripts[scriptName] === "string") {
                return {
                    command: `${manager} run ${scriptName}`,
                    label: `${manager} run ${scriptName}`,
                    hint: `package.json defines a "${scriptName}" script`,
                    ecosystem: "node",
                };
            }
        }
    } catch {
        // malformed package.json — fall through, nothing to suggest
    }
    return undefined;
}

function detectNode(dir: string): SetupSuggestion[] {
    const matched = NODE_MANAGERS.find((m) => fileExists(dir, m.lockfile));
    const fallback = !matched && fileExists(dir, "package.json") ? NODE_MANAGERS[3] : undefined;
    const chosen = matched ?? fallback;
    if (!chosen) return [];

    const out: SetupSuggestion[] = [];
    const script = detectNodeScript(dir, chosen.name);
    if (script) out.push(script);
    out.push({
        command: chosen.install,
        label: chosen.install,
        hint: matched ? `detected ${matched.lockfile}` : "package.json present (no lockfile)",
        ecosystem: "node",
    });
    return out;
}

function detectRuby(dir: string): SetupSuggestion[] {
    if (fileExists(dir, "Gemfile.lock") || fileExists(dir, "Gemfile")) {
        return [
            {
                command: "bundle install",
                label: "bundle install",
                hint: fileExists(dir, "Gemfile.lock") ? "detected Gemfile.lock" : "detected Gemfile",
                ecosystem: "ruby",
            },
        ];
    }
    return [];
}

function detectPython(dir: string): SetupSuggestion[] {
    if (fileExists(dir, "poetry.lock") || fileExists(dir, "pyproject.toml")) {
        const hasPoetry = fileExists(dir, "poetry.lock");
        const hasPyproject = fileExists(dir, "pyproject.toml");
        if (hasPoetry || (hasPyproject && readPyprojectHasPoetry(dir))) {
            return [
                {
                    command: "poetry install",
                    label: "poetry install",
                    hint: hasPoetry ? "detected poetry.lock" : "pyproject.toml uses poetry",
                    ecosystem: "python",
                },
            ];
        }
    }
    if (fileExists(dir, "Pipfile")) {
        return [{ command: "pipenv install", label: "pipenv install", hint: "detected Pipfile", ecosystem: "python" }];
    }
    if (fileExists(dir, "uv.lock")) {
        return [{ command: "uv sync", label: "uv sync", hint: "detected uv.lock", ecosystem: "python" }];
    }
    if (fileExists(dir, "requirements.txt")) {
        return [
            {
                command: "pip install -r requirements.txt",
                label: "pip install -r requirements.txt",
                hint: "detected requirements.txt",
                ecosystem: "python",
            },
        ];
    }
    return [];
}

function readPyprojectHasPoetry(dir: string): boolean {
    try {
        return readFileSync(join(dir, "pyproject.toml"), "utf-8").includes("[tool.poetry]");
    } catch {
        return false;
    }
}

function detectRust(dir: string): SetupSuggestion[] {
    if (fileExists(dir, "Cargo.toml")) {
        return [{ command: "cargo build", label: "cargo build", hint: "detected Cargo.toml", ecosystem: "rust" }];
    }
    return [];
}

function detectGo(dir: string): SetupSuggestion[] {
    if (fileExists(dir, "go.mod")) {
        return [{ command: "go mod download", label: "go mod download", hint: "detected go.mod", ecosystem: "go" }];
    }
    return [];
}

function detectElixir(dir: string): SetupSuggestion[] {
    if (fileExists(dir, "mix.exs")) {
        return [{ command: "mix deps.get", label: "mix deps.get", hint: "detected mix.exs", ecosystem: "elixir" }];
    }
    return [];
}

function detectPhp(dir: string): SetupSuggestion[] {
    if (fileExists(dir, "composer.json")) {
        return [
            {
                command: "composer install",
                label: "composer install",
                hint: "detected composer.json",
                ecosystem: "php",
            },
        ];
    }
    return [];
}

function detectMake(dir: string): SetupSuggestion[] {
    if (!fileExists(dir, "Makefile")) return [];
    try {
        const content = readFileSync(join(dir, "Makefile"), "utf-8");
        for (const target of ["setup", "bootstrap", "install"]) {
            const re = new RegExp(`^${target}\\s*:`, "m");
            if (re.test(content)) {
                return [
                    {
                        command: `make ${target}`,
                        label: `make ${target}`,
                        hint: `Makefile defines a "${target}" target`,
                        ecosystem: "make",
                    },
                ];
            }
        }
    } catch {
        // ignore
    }
    return [];
}

function detectScript(dir: string): SetupSuggestion[] {
    for (const script of ["bin/setup", "script/setup", "script/bootstrap"]) {
        if (fileExists(dir, script)) {
            return [
                {
                    command: `./${script}`,
                    label: `./${script}`,
                    hint: `repo ships a ${script} script`,
                    ecosystem: "script",
                },
            ];
        }
    }
    return [];
}

/**
 * Scan a worktree directory and return ranked install-command suggestions.
 *
 * Ranking strategy:
 *   1. Repo-authored bootstrap scripts (bin/setup, Makefile setup) win — they
 *      encode the answer the maintainer wants you to use.
 *   2. Node ecosystem next (most common in this org), with one entry per repo.
 *   3. Other ecosystems in detection order.
 *
 * If multiple ecosystems are present (e.g. JS frontend + Ruby backend), each
 * is returned separately. The wizard adds a "run all of them" combined choice
 * on top when there is more than one.
 */
export function detectSetup(dir: string): SetupSuggestion[] {
    const suggestions: SetupSuggestion[] = [
        ...detectScript(dir),
        ...detectMake(dir),
        ...detectNode(dir),
        ...detectRuby(dir),
        ...detectPython(dir),
        ...detectRust(dir),
        ...detectGo(dir),
        ...detectElixir(dir),
        ...detectPhp(dir),
    ];

    // Dedupe by command (e.g. avoid suggesting the same `npm install` twice).
    const seen = new Set<string>();
    return suggestions.filter((s) => {
        if (seen.has(s.command)) return false;
        seen.add(s.command);
        return true;
    });
}
