/**
 * E2E tests for `wt init`.
 *
 * We redirect HOME to a temp directory so tests never touch the real ~/.zshrc
 * or ~/.bashrc. The SHELL env var controls which config file is targeted.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GIT_ENV, makeTmpDir, runWt } from "./helpers.js";

describe("wt init", () => {
    let homeDir: string;

    function wtEnv(shellPath = "/bin/zsh"): NodeJS.ProcessEnv {
        return { ...GIT_ENV, HOME: homeDir, SHELL: shellPath };
    }

    beforeEach(() => {
        homeDir = makeTmpDir("init");
    });

    afterEach(() => {
        rmSync(homeDir, { recursive: true, force: true });
    });

    // ---------------------------------------------------------------------------
    // Fresh install
    // ---------------------------------------------------------------------------

    it("appends shell integration to a new .zshrc and exits 0", () => {
        const result = runWt(["init"], { cwd: homeDir, env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("added");

        const content = readFileSync(join(homeDir, ".zshrc"), "utf-8");
        expect(content).toContain("# --- wt shell integration");
        expect(content).toContain("# --- end wt shell integration ---");
        expect(content).toContain("wt()");
    });

    it("installed wrapper covers cd, new, get, rm, remove subcommands", () => {
        runWt(["init"], { cwd: homeDir, env: wtEnv() });
        const content = readFileSync(join(homeDir, ".zshrc"), "utf-8");
        expect(content).toContain("cd|new|get|rm|remove");
    });

    it("tells the user to source the file after install", () => {
        const result = runWt(["init"], { cwd: homeDir, env: wtEnv() });
        expect(result.stderr).toContain("source");
        expect(result.stderr).toContain(".zshrc");
    });

    it("appends to an existing shell config without overwriting it", () => {
        writeFileSync(join(homeDir, ".zshrc"), "# my existing config\nalias ll='ls -la'\n");

        runWt(["init"], { cwd: homeDir, env: wtEnv() });

        const content = readFileSync(join(homeDir, ".zshrc"), "utf-8");
        expect(content).toContain("# my existing config");
        expect(content).toContain("alias ll='ls -la'");
        expect(content).toContain("wt()");
    });

    // ---------------------------------------------------------------------------
    // Already-installed guard
    // ---------------------------------------------------------------------------

    it("reports already installed when integration exists and exits 0", () => {
        runWt(["init"], { cwd: homeDir, env: wtEnv() });

        const result = runWt(["init"], { cwd: homeDir, env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("already installed");
    });

    it("does not duplicate the integration when run twice without --force", () => {
        runWt(["init"], { cwd: homeDir, env: wtEnv() });
        runWt(["init"], { cwd: homeDir, env: wtEnv() });

        const content = readFileSync(join(homeDir, ".zshrc"), "utf-8");
        const count = (content.match(/# --- wt shell integration/g) ?? []).length;
        expect(count).toBe(1);
    });

    // ---------------------------------------------------------------------------
    // --force: update / re-install
    // ---------------------------------------------------------------------------

    it("--force replaces existing integration and reports updated", () => {
        runWt(["init"], { cwd: homeDir, env: wtEnv() });

        const result = runWt(["init", "--force"], { cwd: homeDir, env: wtEnv() });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("updated");

        const content = readFileSync(join(homeDir, ".zshrc"), "utf-8");
        const count = (content.match(/# --- wt shell integration/g) ?? []).length;
        expect(count).toBe(1);
        expect(content).toContain("# --- end wt shell integration ---");
    });

    it("--force strips old-format wrapper (start marker only, no end marker) and installs new one", () => {
        const oldWrapper = `# before

# --- wt shell integration (added by wt init) ---
wt() {
  command wt "$@"
}

# after
`;
        writeFileSync(join(homeDir, ".zshrc"), oldWrapper);

        const result = runWt(["init", "--force"], { cwd: homeDir, env: wtEnv() });
        expect(result.status).toBe(0);

        const content = readFileSync(join(homeDir, ".zshrc"), "utf-8");
        // New format with end marker installed
        expect(content).toContain("# --- end wt shell integration ---");
        // Only one copy of the integration
        const count = (content.match(/# --- wt shell integration/g) ?? []).length;
        expect(count).toBe(1);
        // Content around the old wrapper is preserved
        expect(content).toContain("# before");
        expect(content).toContain("# after");
    });

    // ---------------------------------------------------------------------------
    // Shell detection
    // ---------------------------------------------------------------------------

    it("targets .bashrc when SHELL is bash and .bashrc already exists", () => {
        // Pre-create .bashrc so detectShellConfig returns it over .bash_profile
        writeFileSync(join(homeDir, ".bashrc"), "");

        runWt(["init"], { cwd: homeDir, env: wtEnv("/bin/bash") });

        const content = readFileSync(join(homeDir, ".bashrc"), "utf-8");
        expect(content).toContain("wt()");
        expect(existsSync(join(homeDir, ".bash_profile"))).toBe(false);
    });

    it("targets .bash_profile when SHELL is bash and .bashrc does not exist", () => {
        // No .bashrc → detectShellConfig falls back to .bash_profile
        runWt(["init"], { cwd: homeDir, env: wtEnv("/bin/bash") });

        const profilePath = join(homeDir, ".bash_profile");
        expect(existsSync(profilePath)).toBe(true);
        const content = readFileSync(profilePath, "utf-8");
        expect(content).toContain("wt()");
    });
});
