import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PKG_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const CLI = join(PKG_ROOT, "dist/cli.js");
export const PKG_ROOT_PATH = PKG_ROOT;

export function runHook(
  subcommand: string,
  payload: Record<string, unknown>,
  options: { pluginRoot?: string; home?: string } = {},
): Promise<{ stdout: string; code: number | null }> {
  const home = options.home ?? mkdtempSync(join(tmpdir(), "omo-grok-home-"));
  const pluginRoot = options.pluginRoot ?? PKG_ROOT;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, subcommand], {
      env: {
        ...process.env,
        GROK_PLUGIN_ROOT: pluginRoot,
        GROK_HOME: home,
        OMO_HASHLINE: "1",
        OMO_LSP_ENFORCE: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c: string) => { stdout += c; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, code }));
    child.stdin.end(JSON.stringify(payload));
  });
}