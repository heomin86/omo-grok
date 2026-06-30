import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { GrokHookEvent } from "./grok-io.js";

type StashEntry = {
  diagnostics: string;
  has_errors: boolean;
};

type StashFile = {
  version: number;
  files: Record<string, StashEntry>;
};

const ERROR_PATTERN = /^(?:error|warning|information|hint)\[[^\]\r\n]+\] \(\d+:\d+:/m;
const CLEAN_TEXT = "No diagnostics found";
const UNSUPPORTED_PREFIX = "No LSP server configured for extension:";

const MUTATION_TOOLS = new Set([
  "write",
  "strreplace",
  "str_replace",
  "edit",
  "multiedit",
  "multi_edit",
  "editnotebook",
]);

export function lspEnforceEnabled(): boolean {
  return process.env.OMO_LSP_ENFORCE !== "0" && process.env.OMG_LSP_ENFORCE !== "0";
}

export function grokHome(): string {
  return process.env.GROK_HOME ?? join(process.env.HOME ?? "", ".grok");
}

export function lspStashPath(sessionId: string): string {
  return join(grokHome(), "state", "lsp-diagnostics", `${sessionId || "unknown"}.json`);
}

function pickPath(input: Record<string, unknown>): string | undefined {
  for (const key of ["path", "filePath", "file_path", "target_file", "targetFile"]) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function resolveAbsPath(filePath: string, workspaceRoot: string): string {
  return isAbsolute(filePath) ? resolve(filePath) : resolve(workspaceRoot, filePath);
}

function toolsModule(pluginRoot: string): string | null {
  const mod = join(pluginRoot, "vendor", "lsp-tools-mcp", "dist", "tools.js");
  return existsSync(mod) ? mod : null;
}

export async function runLspDiagnostics(absPath: string, pluginRoot: string): Promise<string> {
  const mock = process.env.OMO_LSP_MOCK_DIAG ?? process.env.OMG_LSP_MOCK_DIAG;
  if (mock) return mock;

  const mod = toolsModule(pluginRoot);
  if (!mod) return "";

  const script = `
import { pathToFileURL } from "node:url";
import { executeLspDiagnostics } from pathToFileURL(process.argv[2]).href;
const filePath = process.argv[3];
try {
  const result = await executeLspDiagnostics({ filePath, severity: "error" });
  const text = result.content.map((block) => block.text).join("\\n").trim();
  process.stdout.write(text);
} catch (error) {
  const message = error instanceof Error ? (error.message || String(error)) : String(error);
  process.stderr.write(message);
  process.exit(1);
}
`;

  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script, mod, absPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.on("close", () => resolvePromise(stdout.trim()));
    child.on("error", () => resolvePromise(""));
  });
}

function isUnavailable(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  const markers = [
    "LSP request timeout (method: initialize)",
    "LSP server is still initializing",
    "NOT INSTALLED",
    "Command not found:",
  ];
  return markers.some((marker) => normalized.includes(marker));
}

export function hasLspErrors(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (normalized === CLEAN_TEXT) return false;
  if (normalized.startsWith(UNSUPPORTED_PREFIX)) return false;
  if (isUnavailable(normalized)) return false;
  if (ERROR_PATTERN.test(normalized)) return true;
  const lower = normalized.toLowerCase();
  return lower.startsWith("error") || lower.includes("error[");
}

function readStash(path: string): StashFile {
  if (!existsSync(path)) return { version: 1, files: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as StashFile;
    return { version: parsed.version ?? 1, files: parsed.files ?? {} };
  } catch {
    return { version: 1, files: {} };
  }
}

function writeStash(path: string, stash: StashFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(stash, null, 2)}\n`, "utf8");
}

function mergeDiagnostics(stashPath: string, filePath: string, diagnostics: string): void {
  const stash = readStash(stashPath);
  const entry: StashEntry = {
    diagnostics,
    has_errors: hasLspErrors(diagnostics),
  };
  if (entry.has_errors) {
    stash.files[filePath] = entry;
  } else {
    delete stash.files[filePath];
  }
  writeStash(stashPath, stash);
}

export async function updateLspStashFromPostTool(
  event: GrokHookEvent,
  pluginRoot: string,
): Promise<void> {
  const tool = (event.toolName ?? "").toLowerCase();
  if (tool && !MUTATION_TOOLS.has(tool)) return;
  const filePath = pickPath(event.toolInput ?? {});
  if (!filePath) return;

  const absPath = resolveAbsPath(filePath, event.workspaceRoot);
  if (!existsSync(absPath)) return;

  const diagnostics = await runLspDiagnostics(absPath, pluginRoot);
  if (!diagnostics) return;
  mergeDiagnostics(lspStashPath(event.sessionId), absPath, diagnostics);
}

export function evaluateLspStop(sessionId: string): string | null {
  if (!lspEnforceEnabled()) return null;
  const stash = readStash(lspStashPath(sessionId));
  const filePaths = Object.keys(stash.files).filter((path) => stash.files[path]?.has_errors).sort();
  if (filePaths.length === 0) return null;

  const blocks: string[] = [];
  for (const filePath of filePaths) {
    const entry = stash.files[filePath];
    const lines = [`LSP diagnostics for ${filePath}:`];
    const diag = (entry?.diagnostics ?? "").trim();
    if (diag) {
      for (const chunk of diag.replace(/\r\n/g, "\n").split("\n")) {
        const trimmed = chunk.trim();
        if (!trimmed) continue;
        lines.push(ERROR_PATTERN.test(trimmed) ? `- ${trimmed}` : trimmed);
      }
    } else {
      lines.push("(empty)");
    }
    blocks.push(lines.join("\n"));
  }

  return [
    "Stop blocked: LSP errors remain in files you edited this session.",
    "Run diagnostics on each file and fix errors before stopping.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

export function pluginRootFromEnv(): string {
  return process.env.GROK_PLUGIN_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
}