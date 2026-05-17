import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export interface RegistryEntry {
    path: string;
    name: string;
    addedAt: string;
}

export interface Registry {
    repos: RegistryEntry[];
}

export function registryPath(): string {
    const base = process.env["WT_CONFIG_HOME"] ?? process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
    return join(base, "wt", "registry.json");
}

export function loadRegistry(): Registry {
    const path = registryPath();
    if (!existsSync(path)) return { repos: [] };
    return JSON.parse(readFileSync(path, "utf-8")) as Registry;
}

export function saveRegistry(registry: Registry): void {
    const path = registryPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(registry, null, 2) + "\n");
}

export function registerRepo(repoPath: string, name?: string): void {
    const abs = resolve(repoPath);
    const registry = loadRegistry();
    if (registry.repos.some((r) => r.path === abs)) return;
    registry.repos.push({ path: abs, name: name ?? basename(abs), addedAt: new Date().toISOString() });
    saveRegistry(registry);
}

export function unregisterRepo(pathOrName: string): void {
    const abs = resolve(pathOrName);
    const registry = loadRegistry();
    const before = registry.repos.length;
    registry.repos = registry.repos.filter((r) => r.path !== abs && r.name !== pathOrName);
    if (registry.repos.length < before) saveRegistry(registry);
}

export function listRepos(): RegistryEntry[] {
    return loadRegistry().repos.filter((r) => existsSync(join(r.path, ".bare")));
}
